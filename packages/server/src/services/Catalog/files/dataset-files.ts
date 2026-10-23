import * as path from 'node:path';
import type { Readable } from 'node:stream';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Catalog, Storage } from '@quarry/shared/domain';
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

/** A file as it arrives in a multipart request — read once, as a stream. */
export interface IncomingFile {
    readonly filename: string;
    readonly stream:   Readable;
}

/**
 * Files in, rows out — Foundry's model: an uploaded CSV or Parquet file is
 * stored exactly as it came, in one transaction, and the dataset's schema says
 * how to read it (for CSV, its columns and dialect, inferred by DuckDB and
 * editable). Reached as `catalog.files`.
 *
 *   upload       file → transaction (snapshot or append) → inferred schema → commit
 *   preview      the latest view's first rows, read with its schema
 *   setSchema    a transaction that changes only the schema
 *
 * Writes are RLS's (write on the dataset); preview is gated — it reads storage.
 */
@Injectable()
export class DatasetFiles {

    constructor(
        readonly gatekeeper:                    GatekeeperService,
        readonly audit:                         AuditService,
        private readonly transactions:          DatasetTransactions,
        private readonly transactionRepository: TransactionRepository,
        private readonly datasetRepository:     DatasetRepository,
        private readonly storage:               FileStorage,
        private readonly duckdb:                DuckDb,
    ) {}

    /** A new dataset from a file, named after it unless a name is given. If the file can't be stored or read, the new dataset is trashed again. */
    async createFromFile(principal: Principal, fields: Catalog.API.Dataset.Upload.NewFields, file: IncomingFile): Promise<Catalog.API.Dataset.Upload.Response> {
        const filename = requireFormat(file);

        const dataset = await this.datasetRepository.create(principal, {
            rid:         Catalog.Dataset.createRid(),
            name:        fields.name ?? datasetName(filename),
            description: fields.description,
            parentRid:   fields.parentRid,
        });

        try {
            return await this.upload(principal, dataset.rid, 'snapshot', file);
        }
        catch (error) {
            await this.datasetRepository.trash(principal, dataset.rid).catch(() => undefined);
            throw error;
        }
    }

    /**
     * Snapshot: the file replaces the dataset's files and schema. Append: the file
     * is added, and must have the dataset's format and columns — it's read with
     * the dataset's schema, not its own.
     */
    async upload(principal: Principal, datasetRid: Catalog.Dataset.Rid, mode: 'snapshot' | 'append', file: IncomingFile): Promise<Catalog.API.Dataset.Upload.Response> {
        const filename = requireFormat(file);
        const format = Storage.File.formatOf(filename)!;
        // Opening first: may this principal write here at all (RLS) — before anything about the dataset's contents is answered.
        const transaction = await this.transactions.open(principal, datasetRid, mode, { upload: filename }).catch((error: unknown) => {
            throw drained(file, error as Error);
        });

        try {
            const current = mode === 'append' ? await this.transactionRepository.resolveView(principal, datasetRid, 'main') : null;

            if (current?.files.some((existing) => existing.logicalPath === filename))
                throw new ConflictException(`The dataset already has a file named ${filename} — upload as a snapshot to replace its files`);

            const key = `${this.transactions.storagePrefix(datasetRid, transaction.rid)}${filename}`;
            const stored = await this.storage.upload(key, file.stream, format === 'csv' ? 'text/csv' : 'application/vnd.apache.parquet');

            if (stored.bytes === 0)
                throw new BadRequestException(`${filename} is empty`);

            const inferred = await this.infer(format, key);

            if (current?.schema && !sameShape(current.schema, inferred.schema))
                throw new BadRequestException(`${filename} doesn't match the dataset's columns or format — upload it as a snapshot to replace the schema`);

            await this.transactions.registerChanges(principal, datasetRid, transaction.rid, [
                format === 'csv'
                    ? { op: 'add', logicalPath: filename, format: 'csv', key, bytes: stored.bytes, rowCount: null }
                    : { op: 'add', logicalPath: filename, format: 'parquet', key, bytes: stored.bytes, rowCount: inferred.rowCount },
            ]);

            // An append keeps the dataset's schema (null = unchanged); a snapshot, or the first file, brings the file's.
            await this.transactions.commit(principal, datasetRid, transaction.rid, current?.schema ? null : inferred.schema);

            const dataset = await this.datasetRepository.get(principal, datasetRid);

            return { dataset: dataset!, schema: current?.schema ?? inferred.schema };
        }
        catch (error) {
            file.stream.resume();                           // drain what's left, or the request never ends
            await this.transactions.abort(Principal.SELF('catalog.files.upload'), datasetRid, transaction.rid).catch(() => undefined);
            throw error;
        }
    }

    /** The first `limit` rows of the latest view. Gated: it hands out file contents, and RLS alone would answer a discoverer with an empty view. */
    @Audit('read', (limit: number) => ({ op: 'preview', limit }))
    @SecurityGate('read')
    async preview(principal: Principal, datasetRid: Catalog.Dataset.Rid, limit: number): Promise<Catalog.API.Dataset.Preview.Response> {
        const view = await this.transactionRepository.resolveView(principal, datasetRid, 'main');

        if (!view.schema || view.files.length === 0)
            return { schema: view.schema, rows: [] };

        const scan = this.scan(view.schema, view.files.map((file) => this.storage.url(file.key)));
        const columns = view.schema.columns.map((column) => identifier(column.name)).join(', ');

        const rows = await this.duckdb.with(async (connection) =>
            (await connection.runAndReadAll(`SELECT ${columns} FROM ${scan} LIMIT ${limit}`)).getRowsJson());

        return { schema: view.schema, rows };
    }

    /**
     * Replaces the schema: a transaction with no file changes. The reader's
     * format must stay the files' format; whether the new types parse is checked
     * by reading the first rows before committing.
     */
    async setSchema(principal: Principal, datasetRid: Catalog.Dataset.Rid, schema: ColumnSchema.Schema): Promise<number> {
        const view = await this.transactionRepository.resolveView(principal, datasetRid, 'main');

        if (view.files.length === 0)
            throw new BadRequestException('The dataset has no files to describe yet');

        if (view.files.some((file) => file.format !== schema.reader.format))
            throw new BadRequestException(`The dataset's files are ${view.files[0]!.format}; the schema's reader must be too`);

        await this.duckdb.with((connection) => connection.run(`SELECT * FROM ${this.scan(schema, view.files.map((file) => this.storage.url(file.key)))} LIMIT 100`))
            .catch((error: unknown) => { throw new BadRequestException(`The files don't read with this schema: ${error instanceof Error ? error.message : String(error)}`); });

        const transaction = await this.transactions.open(principal, datasetRid, 'update', { schemaEdit: true });

        try {
            return await this.transactions.commit(principal, datasetRid, transaction.rid, schema);
        }
        catch (error) {
            await this.transactions.abort(Principal.SELF('catalog.files.setSchema'), datasetRid, transaction.rid).catch(() => undefined);
            throw error;
        }
    }

    // ── DuckDB ──────────────────────────────────────────────────────────

    /** What a stored file says about itself: a CSV's dialect and columns (sniffed), a Parquet file's columns and rows. */
    private infer(format: Storage.File.Format, key: string): Promise<{ schema: ColumnSchema.Schema; rowCount: number | null }> {
        const url = literal(this.storage.url(key));

        return this.duckdb.with(async (connection) => {
            if (format === 'csv') {
                const sniffed = (await connection.runAndReadAll(`SELECT Delimiter, Quote, Escape, HasHeader, Columns FROM sniff_csv(${url})`)).getRowObjectsJS()[0]!;
                const columns = (sniffed.Columns as { name: string; type: string }[])
                    .map((column) => ({ name: column.name, type: toColumnType(column.type), nullable: true }));

                return {
                    schema:   { columns, reader: { format: 'csv', delimiter: String(sniffed.Delimiter), quote: character(sniffed.Quote), escape: character(sniffed.Escape), header: Boolean(sniffed.HasHeader) } },
                    rowCount: null,
                };
            }

            const described = (await connection.runAndReadAll(`DESCRIBE SELECT * FROM read_parquet(${url})`)).getRowObjectsJS();
            const counted = (await connection.runAndReadAll(`SELECT count(*) AS n FROM read_parquet(${url})`)).getRowObjectsJS()[0]!;

            return {
                schema: {
                    columns: described.map((row) => ({ name: String(row.column_name), type: toColumnType(String(row.column_type)), nullable: String(row.null) !== 'NO' })),
                    reader:  { format: 'parquet' },
                },
                rowCount: Number(counted.n),
            };
        });
    }

    /** A DuckDB table expression reading these files with this schema — CSV columns cast to the schema's types. */
    private scan(schema: ColumnSchema.Schema, urls: string[]): string {
        const files = `[${urls.map(literal).join(', ')}]`;

        if (schema.reader.format === 'parquet')
            return `read_parquet(${files}, union_by_name = true)`;

        const { delimiter, quote, escape, header } = schema.reader;
        const columns = schema.columns.map((column) => `${literal(column.name)}: ${literal(fromColumnType(column.type))}`).join(', ');

        return `read_csv(${files}, delim = ${literal(delimiter)}, quote = ${literal(quote)}, escape = ${literal(escape)}, header = ${header}, auto_detect = false, columns = {${columns}})`;
    }
}

// ── helpers ─────────────────────────────────────────────────────────────

/** The file's name, if its extension is one we read (CSV, Parquet) — else 400. */
function requireFormat(file: IncomingFile): string {
    const filename = path.basename(file.filename ?? '').replace(/[^\w.\- ()]/g, '_');

    if (!filename || !Storage.File.formatOf(filename))
        throw drained(file, new BadRequestException('Upload a .csv or .parquet file'));

    return filename;
}

/** Drains the unread upload before failing — otherwise the client keeps sending into a closed request. */
function drained<E extends Error>(file: IncomingFile, error: E): E {
    file.stream.resume();
    return error;
}

/** "sales 2026.csv" → "sales 2026". */
const datasetName = (filename: string) => (path.parse(filename).name.trim() || filename).slice(0, 255);

/** DuckDB reports "no quote/escape character" as "(empty)". */
const character = (value: unknown) => (value === '(empty)' || value === null || value === undefined ? '' : String(value));

/** Same format, same column names in the same order (types may differ — appended files are read with the dataset's schema). */
function sameShape(dataset: ColumnSchema.Schema, file: ColumnSchema.Schema): boolean {
    if (dataset.reader.format !== file.reader.format)
        return false;

    if (dataset.reader.format === 'csv' && file.reader.format === 'csv'
        && (dataset.reader.delimiter !== file.reader.delimiter || dataset.reader.header !== file.reader.header))
        return false;

    return dataset.columns.length === file.columns.length
        && dataset.columns.every((column, index) => column.name === file.columns[index]!.name);
}
