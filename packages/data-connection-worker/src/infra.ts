// Imported first by main.ts: reflect-metadata before any decorator runs, env before any module reads it.
import 'reflect-metadata';
import * as path from 'node:path';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import axios, { type AxiosInstance } from 'axios';
import type { ConnectionOptions, Job } from 'bullmq';
import dotenv from 'dotenv';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { Catalog, DataConnection, type Foundations, type Keychain } from '@quarry/shared/domain';
import { Encryption } from '@quarry/shared/server/encryption';
import { System } from '@quarry/shared/server/system';
import { findDefinition, SOURCE_DEFINITIONS, type SourceDefinition } from '@quarry/integrations/definitions';
import { literal, toColumnType } from '@quarry/integrations/core/duckdb';
import { SOURCE_RUNTIMES, type RuntimeContext, type SourceRuntime, type SyncResult, type SyncRunContext } from '@quarry/integrations/runtimes';

const log = System.log.withContext('ServerConnection');

// ── env ─────────────────────────────────────────────────────────────────
// src/ → data-connection-worker/ → packages/ → repo root. In containers, env comes from the environment.
const root = (file: string) => path.resolve(__dirname, '../../../', file);

if (process.env.ENV_FILE)
    dotenv.config({ path: root(process.env.ENV_FILE), quiet: true });

dotenv.config({ path: root('.env'), quiet: true });

export function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`Missing env var ${name}`);

    return value;
}

// ── the server's /internal API ─────────────────────────────────────────

let client: AxiosInstance | undefined;

/** The server, authenticated with the service token. Every database read or write goes through here. */
export function server(): AxiosInstance {
    return (client ??= axios.create({
        baseURL: requireEnv('QUARRY_SERVER_URL'),
        headers: { authorization: `Bearer ${requireEnv('QUARRY_INTERNAL_TOKEN')}` },
        timeout: 60_000,
    }));
}

/** Blocks until the server answers its health check — started together, the worker may come up first. */
export async function waitForServer(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await server().get('/api/health', { timeout: 2_000 });
            return;
        }
        catch {
            if (attempt % 10 === 0)
                log.info(`Waiting for the server at ${requireEnv('QUARRY_SERVER_URL')}…`);

            await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
    }
}

// ── queues ──────────────────────────────────────────────────────────────

/** Same prefix as the server's producers. */
export const QUEUE_PREFIX = 'quarry';

export function redisConnection(): ConnectionOptions {
    const url = new URL(requireEnv('REDIS_URL'));

    return {
        host:                 url.hostname,
        port:                 Number(url.port || 6379),
        username:             url.username || undefined,
        password:             url.password ? decodeURIComponent(url.password) : undefined,
        db:                   url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
        tls:                  url.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: null,                   // required by BullMQ
    };
}

/**
 * Base for @Processor classes consuming a queue declared in @quarry/shared:
 * Redis data is untyped and a deploy can leave old-shaped jobs behind, so the
 * job is parsed before `handle` sees it, and the result before BullMQ stores it.
 */
export abstract class JobProcessor<Q extends Foundations.Queue.Definition> extends WorkerHost {
    protected abstract readonly definition: Q;
    protected abstract handle(job: Foundations.Queue.JobOf<Q>, raw: Job): Promise<Foundations.Queue.ResultOf<Q>>;

    async process(raw: Job): Promise<Foundations.Queue.ResultOf<Q>> {
        const job = this.definition.job.parse(raw.data) as Foundations.Queue.JobOf<Q>;

        return this.definition.result.parse(await this.handle(job, raw)) as Foundations.Queue.ResultOf<Q>;
    }
}

// ── DuckDB ──────────────────────────────────────────────────────────────

/** One in-memory DuckDB for the process, with the postgres + httpfs extensions and a secret for the dataset bucket. */
@Injectable()
export class DuckDb implements OnModuleDestroy {

    private instance: Promise<DuckDBInstance> | undefined;

    /** A connection the caller owns and closes (closeSync). */
    async connect(): Promise<DuckDBConnection> {
        return (await (this.instance ??= this.create())).connect();
    }

    async with<R>(fn: (connection: DuckDBConnection) => Promise<R>): Promise<R> {
        const connection = await this.connect();

        try {
            return await fn(connection);
        }
        finally {
            connection.closeSync();
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.instance)
            (await this.instance).closeSync();
    }

    private async create(): Promise<DuckDBInstance> {
        const instance = await DuckDBInstance.create(':memory:');
        const connection = await instance.connect();
        const endpoint = new URL(requireEnv('S3_ENDPOINT'));

        try {
            await connection.run('INSTALL httpfs; LOAD httpfs; INSTALL postgres; LOAD postgres;');
            await connection.run(`
                CREATE OR REPLACE SECRET quarry_datasets (
                    TYPE      s3,
                    KEY_ID    ${literal(requireEnv('S3_ACCESS_KEY'))},
                    SECRET    ${literal(requireEnv('S3_SECRET_KEY'))},
                    ENDPOINT  ${literal(endpoint.host)},
                    REGION    ${literal(process.env.S3_REGION ?? 'us-east-1')},
                    URL_STYLE 'path',
                    USE_SSL   ${endpoint.protocol === 'https:'},
                    SCOPE     ${literal(`s3://${requireEnv('S3_BUCKET')}`)}
                )`);
        }
        finally {
            connection.closeSync();
        }

        return instance;
    }
}

// ── sources ─────────────────────────────────────────────────────────────

/**
 * A source's credential as the server sent it (encrypted) → the values its
 * runtime gets: decrypted with the workspace key, checked to be of the
 * definition's template, parsed against its Fields. They live in this process's memory only.
 */
function decryptCredential(
    source:     Pick<DataConnection.Source.Schema, 'rid'>,
    definition: SourceDefinition,
    credential: Keychain.Credential.Encrypted | null,
): unknown {
    const template = definition.credential;

    if (!template)
        return null;

    if (!credential)
        throw new Error(`Source ${source.rid} has no credential; ${definition.displayName} needs a ${template.displayName} one`);

    if (credential.templateId !== template.id)
        throw new Error(`Source ${source.rid}: credential ${credential.rid} is a '${credential.templateId}' credential, ${definition.displayName} needs '${template.id}'`);

    return template.Fields.parse(Encryption.decrypt(credential.blob));
}

/** Creates source runtimes from @quarry/integrations and runs work on an open one. */
@Injectable()
export class SourceRuntimes {

    private readonly ctx: RuntimeContext;

    constructor(duckdb: DuckDb) {
        this.ctx = { duckdb };

        // Fail at boot, not on the first sync, if a definition has no implementation.
        const missing = Object.values(SOURCE_DEFINITIONS).filter((definition) => !SOURCE_RUNTIMES[definition.id]);

        if (missing.length > 0)
            throw new Error(`Source definitions without a runtime: ${missing.map((definition) => definition.id).join(', ')}`);
    }

    /**
     * open → fn → close; close runs even if open or fn throws. The config is
     * re-validated against its definition, the credential decrypted for the runtime.
     */
    async with<R>(
        source:     Pick<DataConnection.Source.Schema, 'rid' | 'definitionId' | 'config'>,
        credential: Keychain.Credential.Encrypted | null,
        fn:         (runtime: SourceRuntime) => Promise<R>,
    ): Promise<R> {
        const definition = findDefinition(source.definitionId);
        const Runtime = SOURCE_RUNTIMES[source.definitionId];

        if (!definition || !Runtime)
            throw new Error(`Source ${source.rid} uses unknown definition '${source.definitionId}'`);

        const runtime = new Runtime(
            source.rid,
            definition.Config.parse(source.config) as never,
            decryptCredential(source, definition, credential) as never,
            this.ctx,
        );

        try {
            await runtime.open();

            return await fn(runtime);
        }
        finally {
            await runtime.close();
        }
    }

    /**
     * One sync run: open → sync(config, run) → close. The config is re-validated
     * against the integration's sync Config (defaults applied).
     */
    async sync(
        source:     Pick<DataConnection.Source.Schema, 'rid' | 'definitionId' | 'config'>,
        credential: Keychain.Credential.Encrypted | null,
        config:     DataConnection.Sync.Config,
        run:        SyncRunContext,
    ): Promise<SyncResult> {
        const definition = findDefinition(source.definitionId);

        if (!definition)
            throw new Error(`Source ${source.rid} uses unknown definition '${source.definitionId}'`);

        const parsed = definition.sync.Config.parse(config);

        return this.with(source, credential, (runtime) => runtime.sync(parsed as never, run));
    }
}

// ── Parquet ─────────────────────────────────────────────────────────────

/**
 * What the copy wrote under `destination` (`s3://bucket/<prefix>/`): rows per
 * object key, from the Parquet footers, and the column schema — read from the
 * files rather than asked of the source, so every source type gets it.
 */
export async function describeParquet(duckdb: DuckDb, destination: string): Promise<{ rowCounts: Record<string, number>; schema: Catalog.ColumnSchema.Schema | null }> {
    const glob = literal(`${destination}*.parquet`);
    const bucketUrl = `s3://${requireEnv('S3_BUCKET')}/`;

    return duckdb.with(async (connection) => {
        const counts = await connection.runAndReadAll(`SELECT filename, count(*) AS row_count FROM read_parquet(${glob}, filename = true) GROUP BY filename`);
        const rowCounts = Object.fromEntries(counts.getRowObjectsJS().map((row) => [String(row.filename).slice(bucketUrl.length), Number(row.row_count)]));

        if (Object.keys(rowCounts).length === 0)
            return { rowCounts, schema: null };

        const described = await connection.runAndReadAll(`DESCRIBE SELECT * FROM read_parquet(${glob})`);
        const columns = described.getRowObjectsJS().map((row) => ({
            name:     String(row.column_name),
            type:     toColumnType(String(row.column_type)),
            nullable: String(row.null) !== 'NO',
        }));

        return { rowCounts, schema: { columns, reader: { format: 'parquet' as const } } };
    });
}
