import type { DuckDBConnection } from '@duckdb/node-api';
import type { DataConnection } from '@quarry/shared/domain';
import { identifier, literal } from '../core/duckdb';
import type { SyncConfigOf } from '../core/definition';
import { SourceRuntime, type SyncResult, type SyncRunContext } from '../core/runtime';
import type { Definition } from './definition';

/** A libpq connection-string value: single-quoted, backslash-escaped. */
const libpq = (value: string | number | boolean) =>
    `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * DuckDB quotes the whole connection string in its errors ("Unable to connect
 * to Postgres at …"), password included — and the error travels on to the
 * test result, the toast and the logs. Mask it before it leaves.
 */
const redact = (message: string, password: string) => {
    const masked = message.replace(/password='(?:[^'\\]|\\.)*'/g, "password='***'");

    return password ? masked.split(password).join('***') : masked;
};

/**
 * Postgres through DuckDB's postgres extension: open() attaches the database
 * read-only under a unique alias on a connection of its own; sync() COPYs a
 * table or a query's result straight to Parquet in the bucket, so rows never pass through Node.
 */
export class PostgresRuntime extends SourceRuntime<typeof Definition> {

    private connection: DuckDBConnection | null = null;

    // Attachments are per DuckDB instance, shared by every connection — hence a unique alias.
    private readonly alias = `src_${crypto.randomUUID().replace(/-/g, '')}`;
    private attached = false;

    async open(): Promise<void> {
        const { host, port, database, user, password, ssl } = this.credential;

        const dsn = [
            `host=${libpq(host)}`,
            `port=${libpq(port)}`,
            `dbname=${libpq(database)}`,
            `user=${libpq(user)}`,
            password ? `password=${libpq(password)}` : '',
            `sslmode=${ssl ? 'require' : 'disable'}`,
        ].filter(Boolean).join(' ');

        this.connection = await this.ctx.duckdb.connect();

        try {
            await this.connection.run(`ATTACH ${literal(dsn)} AS ${identifier(this.alias)} (TYPE postgres, READ_ONLY)`);
        }
        catch (error) {
            // A new error, not a wrapped one: the original's message (and any cause) holds the password.
            throw new Error(redact(error instanceof Error ? error.message : String(error), password));
        }

        this.attached = true;
    }

    async close(): Promise<void> {
        const connection = this.connection;

        this.connection = null;

        if (!connection)
            return;

        try {
            if (this.attached)
                await connection.run(`DETACH ${identifier(this.alias)}`);
        }
        finally {
            this.attached = false;
            connection.closeSync();
        }
    }

    sync(config: SyncConfigOf<typeof Definition>, run: SyncRunContext): Promise<SyncResult> {
        const relation = config.kind === 'table'
            ? `${identifier(this.alias)}.${identifier(config.schema)}.${identifier(config.table)}`
            : `postgres_query(${literal(this.alias)}, ${literal(config.sql)})`;

        return this.copy(relation, config.incrementalColumn, run);
    }

    override async explore(): Promise<DataConnection.Source.Table[]> {
        const reader = await this.requireOpen().runAndReadAll(`
            SELECT schema_name, table_name
              FROM duckdb_tables()
             WHERE database_name = ${literal(this.alias)}
             ORDER BY schema_name, table_name`);

        return reader.getRowObjectsJS().map((row) => ({ schema: String(row.schema_name), name: String(row.table_name) }));
    }

    /**
     * COPYs a relation to Parquet under the run's destination. Incremental (a
     * column given): only rows above the previous run's max of that column —
     * the max, as text, is the state the next run gets.
     */
    private async copy(relation: string, incrementalColumn: string | undefined, run: SyncRunContext): Promise<SyncResult> {
        const connection = this.requireOpen();
        const where = incrementalColumn && run.state !== null
            ? `WHERE ${identifier(incrementalColumn)} > ${literal(run.state)}`
            : '';

        const copied = await connection.runAndReadAll(`
            COPY (SELECT * FROM ${relation} ${where})
              TO ${literal(run.destination)} (FORMAT parquet, PER_THREAD_OUTPUT true)`);

        const rowCount = Number(copied.getRowObjectsJS()[0]?.Count ?? 0);

        if (!incrementalColumn)
            return { rowCount, state: null };

        if (rowCount === 0)
            return { rowCount, state: run.state };

        const max = await connection.runAndReadAll(`
            SELECT max(${identifier(incrementalColumn)})::VARCHAR AS state
              FROM read_parquet(${literal(`${run.destination}*.parquet`)})`);

        return { rowCount, state: (max.getRowObjectsJS()[0]?.state as string | null) ?? run.state };
    }

    private requireOpen(): DuckDBConnection {
        if (!this.connection || !this.attached)
            throw new Error(`Source ${this.rid}: runtime used before open()`);

        return this.connection;
    }
}
