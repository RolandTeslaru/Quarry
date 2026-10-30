import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Readable } from 'node:stream';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Catalog, Dataset, Foundations, Storage } from '@quarry/shared/domain';
import { fromColumnType, identifier, literal, toColumnType } from '@quarry/integrations/core/duckdb';
import { Principal } from '@/auth/principal';
import { FileStorage } from '@/infra/file-storage';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { Audit } from '@/services/Audit/audit.decorator';
import { AuditService } from '@/services/Audit/audit.service';
import { DatasetRepository } from '../dataset.repository';
import { DatasetTransactions } from '../transaction/dataset-transactions';
import { TransactionRepository } from '../transaction/transaction.repository';
import { DuckDb } from './duckdb';

import ColumnSchema = Catalog.ColumnSchema;

/** A sample written for one response: where it is, and which version it came from. */
export interface DatasetSample {
    readonly file:     string;
    readonly sequence: Dataset.Sequence;
}

/** A file as it arrives in a multipart request — read once, as a stream. */
export interface IncomingFile {
    readonly filename: string;
    readonly stream:   Readable;
}

/** What a stored file says about itself. */
interface Inferred {
    readonly schema:   ColumnSchema.Schema;
    readonly rowCount: number | null;
}

/**
 * Files in, rows out — Foundry's model: an uploaded CSV or Parquet file is
 * stored exactly as it came, in one transaction, and the dataset's schema says
 * how to read it (for CSV, its columns and dialect, inferred by DuckDB and
 * editable). Reached as `catalog.storage`.
 *
 *   upload       file → transaction (snapshot or append) → inferred schema → commit
 *   preview      the latest view's first rows, read with its schema
 *   setSchema    a transaction that changes only the schema
 *
 * Writes are RLS's (write on the dataset); reads are gated — they hand out file contents.
 */
@Injectable()
export class CatalogStorage {

    constructor(
        readonly gatekeeper:                    GatekeeperService,
        readonly audit:                         AuditService,
        private readonly transactions:          DatasetTransactions,
        private readonly transactionRepository: TransactionRepository,
        private readonly datasetRepository:     DatasetRepository,
        private readonly storage:               FileStorage,
        private readonly duckdb:                DuckDb,
    ) {}

    /**
     * Snapshot: the file replaces the dataset's files and schema. Append: the file
     * is added, and must have the dataset's format and columns — it's read with
     * the dataset's schema, not its own.
     */
    async upload(
        principal:  Principal,
        datasetRid: Dataset.Rid,
        mode:       'snapshot' | 'append',
        file:       IncomingFile,
    ): Promise<Catalog.API.Dataset.Upload.Response> {
        const filename = requireFormat(file);
        const format = Storage.File.formatOf(filename)!;
        let transaction: Catalog.Transaction.Schema;

        // Opening first: may this principal write here at all (RLS), before anything about its contents is answered.
        try {
            transaction = await this.transactions.open(principal, datasetRid, mode, { upload: filename });
        }
        catch (error) {
            file.stream.resume();                           // drain the upload, or the request never ends
            throw error;
        }

        try {
            const key = Dataset.getStorageKey(datasetRid, transaction.rid, filename);
            let contentType = 'application/vnd.apache.parquet';

            if (format === 'csv')
                contentType = 'text/csv';

            const stored = await this.storage.upload(key, file.stream, contentType);

            if (stored.bytes === 0)
                throw new BadRequestException(`${filename} is empty`);

            const inferred = await this.infer(format, key);

            let added: Catalog.Transaction.FileChange.Schema = {
                op:          'add',
                logicalPath: filename,
                format:      'parquet',
                key,
                bytes:       stored.bytes,
                rowCount:    inferred.rowCount,
            };

            if (format === 'csv') {
                added = {
                    op:          'add',
                    logicalPath: filename,
                    format:      'csv',
                    key,
                    bytes:       stored.bytes,
                    rowCount:    null,
                };
            }

            let schema: ColumnSchema.Schema;

            if (mode === 'append')
                schema = await this.append(principal, datasetRid, transaction.rid, added, inferred.schema);
            else
                schema = await this.snapshot(principal, datasetRid, transaction.rid, added, inferred.schema);

            const dataset = await this.datasetRepository.get(principal, datasetRid);

            return {
                dataset: dataset!,
                schema,
            };
        }
        catch (error) {
            file.stream.resume();                           // drain what's left, or the request never ends

            // A failed abort is left to the stale-transaction sweep: the upload's own error is the one to report.
            try {
                await this.transactions.abort(Principal.SELF('catalog.storage.upload'), datasetRid, transaction.rid);
            }
            catch {}

            throw error;
        }
    }

    /** The file replaces the dataset's files, and its own schema becomes the dataset's. */
    private async snapshot(
        principal:      Principal,
        datasetRid:     Dataset.Rid,
        transactionRid: Catalog.Transaction.Rid,
        added:          Catalog.Transaction.FileChange.Schema,
        schema:         ColumnSchema.Schema,
    ): Promise<ColumnSchema.Schema> {
        await this.transactions.registerChanges(principal, datasetRid, transactionRid, [added]);
        await this.transactions.commit(principal, datasetRid, transactionRid, schema);

        return schema;
    }

    /**
     * The file joins the dataset's files under a new name, read with the dataset's schema: it must have the same
     * format, dialect and columns. The dataset's first file sets the schema, as a snapshot would.
     */
    private async append(
        principal:      Principal,
        datasetRid:     Dataset.Rid,
        transactionRid: Catalog.Transaction.Rid,
        added:          Catalog.Transaction.FileChange.Schema,
        schema:         ColumnSchema.Schema,
    ): Promise<ColumnSchema.Schema> {
        const current = await this.transactionRepository.resolveView(principal, datasetRid, Foundations.MAIN_BRANCH);

        if (current.files.some((existing) => existing.logicalPath === added.logicalPath)) {
            const message = `The dataset already has a file named ${added.logicalPath} — upload as a snapshot to replace its files`;

            throw new ConflictException(message);
        }

        if (!current.schema)
            return this.snapshot(principal, datasetRid, transactionRid, added, schema);

        if (!sameShape(current.schema, schema)) {
            const message = `${added.logicalPath} doesn't match the dataset's columns or format — upload it as a snapshot to replace the schema`;

            throw new BadRequestException(message);
        }

        await this.transactions.registerChanges(principal, datasetRid, transactionRid, [added]);
        await this.transactions.commit(principal, datasetRid, transactionRid, null);       // null: the schema stays

        return current.schema;
    }

    /**
     * A random sample of the latest view, written to a Parquet file in the temp
     * directory (the caller streams and deletes it).
     */
    @Audit('read', (rows: number) => ({ op: 'sample', rows }))
    @SecurityGate('read')
    async sample(principal: Principal, datasetRid: Dataset.Rid, rows: number): Promise<DatasetSample> {
        const view = await this.transactionRepository.resolveView(principal, datasetRid, Foundations.MAIN_BRANCH);

        if (!view.schema || view.files.length === 0)
            throw new ConflictException('The dataset has no committed data yet');

        const urls = view.files.map((file) => this.storage.url(file.key));
        const scan = this.scan(view.schema, urls);
        const columns = view.schema.columns.map((column) => identifier(column.name)).join(', ');
        const file = path.join(os.tmpdir(), `quarry-sample-${randomUUID()}.parquet`);
        const sampled = `SELECT ${columns} FROM ${scan} USING SAMPLE reservoir(${rows} ROWS)`;
        const query = `COPY (${sampled}) TO ${literal(file)} (FORMAT parquet)`;

        await this.duckdb.with((connection) => connection.run(query));

        return {
            file,
            sequence: view.sequence,
        };
    }

    /** One version's files as read passes, for a job's runtime. */
    @Audit('read', (sequence: Dataset.Sequence) => ({ op: 'read-passes', sequence }))
    @SecurityGate('read')
    async getReadPasses(
        principal:  Principal,
        datasetRid: Dataset.Rid,
        sequence:   Dataset.Sequence,
    ): Promise<Dataset.ReadPasses.Schema> {
        const view = await this.transactionRepository.resolveView(principal, datasetRid, Foundations.MAIN_BRANCH, sequence);
        const files: Dataset.ReadPasses.File[] = [];

        for (const file of view.files) {
            files.push({
                url:   await this.storage.presignGet(file.key),
                bytes: file.bytes,
            });
        }

        return {
            sequence: view.sequence,
            schema:   view.schema,
            files,
        };
    }

    /** The first `limit` rows of the latest view. RLS alone would answer a discoverer with an empty view. */
    @Audit('read', (limit: number) => ({ op: 'preview', limit }))
    @SecurityGate('read')
    async preview(
        principal:  Principal,
        datasetRid: Dataset.Rid,
        limit:      number,
    ): Promise<Catalog.API.Dataset.Preview.Response> {
        const view = await this.transactionRepository.resolveView(principal, datasetRid, Foundations.MAIN_BRANCH);

        if (!view.schema || view.files.length === 0) {
            return {
                schema: view.schema,
                rows:   [],
            };
        }

        const urls = view.files.map((file) => this.storage.url(file.key));
        const scan = this.scan(view.schema, urls);
        const columns = view.schema.columns.map((column) => identifier(column.name)).join(', ');
        const query = `SELECT ${columns} FROM ${scan} LIMIT ${limit}`;

        const rows = await this.duckdb.with(async (connection) => {
            const result = await connection.runAndReadAll(query);

            return result.getRowsJson();
        });

        return {
            schema: view.schema,
            rows,
        };
    }

    /**
     * Replaces the schema: a transaction with no file changes. The reader's
     * format must stay the files' format; whether the new types parse is checked
     * by reading the first rows before committing.
     */
    async setSchema(principal: Principal, datasetRid: Dataset.Rid, schema: ColumnSchema.Schema): Promise<Dataset.Sequence> {
        const view = await this.transactionRepository.resolveView(principal, datasetRid, Foundations.MAIN_BRANCH);

        if (view.files.length === 0)
            throw new BadRequestException('The dataset has no files to describe yet');

        if (view.files.some((file) => file.format !== schema.reader.format)) {
            const message = `The dataset's files are ${view.files[0]!.format}; the schema's reader must be too`;

            throw new BadRequestException(message);
        }

        const urls = view.files.map((file) => this.storage.url(file.key));
        const query = `SELECT * FROM ${this.scan(schema, urls)} LIMIT 100`;

        try {
            await this.duckdb.with((connection) => connection.run(query));
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);

            throw new BadRequestException(`The files don't read with this schema: ${reason}`);
        }

        const transaction = await this.transactions.open(principal, datasetRid, 'update', { schemaEdit: true });

        try {
            return await this.transactions.commit(principal, datasetRid, transaction.rid, schema);
        }
        catch (error) {
            // A failed abort is left to the stale-transaction sweep: the commit's own error is the one to report.
            try {
                await this.transactions.abort(Principal.SELF('catalog.storage.setSchema'), datasetRid, transaction.rid);
            }
            catch {}

            throw error;
        }
    }

    // ── DuckDB ──────────────────────────────────────────────────────────

    /** What a stored file says about itself: a CSV's dialect and columns (sniffed), a Parquet file's columns and rows. */
    private infer(format: Storage.File.Format, key: Storage.File.Key): Promise<Inferred> {
        const url = literal(this.storage.url(key));

        return this.duckdb.with(async (connection): Promise<Inferred> => {
            if (format === 'csv') {
                const query = `SELECT Delimiter, Quote, Escape, HasHeader, Columns FROM sniff_csv(${url})`;
                const sniffing = await connection.runAndReadAll(query);
                const sniffed = sniffing.getRowObjectsJS()[0]!;
                const columns: ColumnSchema.Column[] = [];

                for (const column of sniffed.Columns as { name: string; type: string }[]) {
                    columns.push({
                        name:     column.name,
                        type:     toColumnType(column.type),
                        nullable: true,
                    });
                }

                return {
                    schema: {
                        columns,
                        reader: {
                            format:    'csv',
                            delimiter: String(sniffed.Delimiter),
                            quote:     character(sniffed.Quote),
                            escape:    character(sniffed.Escape),
                            header:    Boolean(sniffed.HasHeader),
                        },
                    },
                    rowCount: null,
                };
            }

            const describing = await connection.runAndReadAll(`DESCRIBE SELECT * FROM read_parquet(${url})`);
            const counting = await connection.runAndReadAll(`SELECT count(*) AS n FROM read_parquet(${url})`);
            const columns: ColumnSchema.Column[] = [];

            for (const row of describing.getRowObjectsJS()) {
                columns.push({
                    name:     String(row.column_name),
                    type:     toColumnType(String(row.column_type)),
                    nullable: String(row.null) !== 'NO',
                });
            }

            return {
                schema: {
                    columns,
                    reader: { format: 'parquet' },
                },
                rowCount: Number(counting.getRowObjectsJS()[0]!.n),
            };
        });
    }

    /** A DuckDB table expression reading these files with this schema — CSV columns cast to the schema's types. */
    private scan(schema: ColumnSchema.Schema, urls: string[]): string {
        const files = `[${urls.map(literal).join(', ')}]`;

        if (schema.reader.format === 'parquet')
            return `read_parquet(${files}, union_by_name = true)`;

        const { delimiter, quote, escape, header } = schema.reader;
        const columns: string[] = [];

        for (const column of schema.columns)
            columns.push(`${literal(column.name)}: ${literal(fromColumnType(column.type))}`);

        const options = [
            `delim = ${literal(delimiter)}`,
            `quote = ${literal(quote)}`,
            `escape = ${literal(escape)}`,
            `header = ${header}`,
            'auto_detect = false',
            `columns = {${columns.join(', ')}}`,
        ];

        return `read_csv(${files}, ${options.join(', ')})`;
    }
}

// ── helpers ─────────────────────────────────────────────────────────────

/** The file's name, if its extension is one we read (CSV, Parquet) — else 400, the upload drained. */
export function requireFormat(file: IncomingFile): string {
    const filename = path.basename(file.filename ?? '').replace(/[^\w.\- ()]/g, '_');

    if (!filename || !Storage.File.formatOf(filename)) {
        file.stream.resume();                               // or the client keeps sending into a closed request

        throw new BadRequestException('Upload a .csv or .parquet file');
    }

    return filename;
}

/** DuckDB reports "no quote/escape character" as "(empty)". */
function character(value: unknown): string {
    if (value === '(empty)' || value === null || value === undefined)
        return '';

    return String(value);
}

/** Same format, same column names in the same order. Types may differ: appended files are read with the dataset's schema. */
function sameShape(dataset: ColumnSchema.Schema, file: ColumnSchema.Schema): boolean {
    if (dataset.reader.format !== file.reader.format)
        return false;

    if (dataset.reader.format === 'csv' && file.reader.format === 'csv') {
        if (dataset.reader.delimiter !== file.reader.delimiter || dataset.reader.header !== file.reader.header)
            return false;
    }

    if (dataset.columns.length !== file.columns.length)
        return false;

    return dataset.columns.every((column, index) => column.name === file.columns[index]!.name);
}
