import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { Queue } from 'bullmq';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataConnection } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { ApiModule } from '@/api.module';
import type { Principal } from '@/auth/principal';
import { destroyPool } from '@/db/pool';
import { QueueJobError } from '@/infra/queue';
import { DataConnectionHarness, type PostgresLogin } from '../support/data-connection-fixtures';
import { withDatabase } from '../support/test-env';

/** How long the worker gets to boot (ts-node compiles it first). */
const WORKER_BOOT_MS = 60_000;

/**
 * End to end, across processes: probing a source — test, explore, preview — is
 * request–reply over Redis to a real Data Connection worker
 * (packages/data-connection-worker), which decrypts the credential and opens
 * the source with DuckDB. The "external" system is a throwaway database on the
 * dev Postgres, made and dropped by this file.
 */
describe('probing a source through a real Data Connection worker', () => {

    let server: NestExpressApplication;
    let worker: ChildProcess;
    let workerLog = '';
    let harness: DataConnectionHarness;
    let user: Principal.User;

    const external = `quarry_test_source_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    let login: PostgresLogin;

    beforeAll(async () => {
        login = await createExternalDatabase(external);

        // Nothing else may reach the worker: runs other test files queued would start for real.
        const syncJobs = new Queue(DataConnection.Queue.Sync.Definition.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });

        await syncJobs.obliterate({ force: true });
        await syncJobs.close();

        server = await NestFactory.create<NestExpressApplication>(ApiModule, { logger: false });
        server.setGlobalPrefix('api');
        server.useWebSocketAdapter(new WsAdapter(server));
        await server.listen(0, '127.0.0.1');

        const { port } = server.getHttpServer().address() as AddressInfo;

        worker = startWorker(`http://127.0.0.1:${port}`, (chunk) => workerLog += chunk);
        await waitFor(() => workerLog.includes('Data Connection worker listening'), WORKER_BOOT_MS, () => `the worker didn't start:\n${workerLog}`);

        harness = await DataConnectionHarness.start();
        user = await harness.createUser();
    }, WORKER_BOOT_MS + 30_000);

    afterAll(async () => {
        worker?.kill('SIGTERM');
        await harness?.stop();
        await server?.close();
        await destroyPool();
        await dropExternalDatabase(external);
    });

    describe('a source that logs in', () => {

        let source: DataConnection.Source.Schema;

        beforeAll(async () => {
            ({ source } = await harness.createSource(user, login));
        });

        it('passes the connection test', async () => {
            await expect(harness.dataConnection.source.test(user, source.rid)).resolves.toEqual({ ok: true, error: null });
        });

        it('lists its tables, across schemas', async () => {
            const { tables } = await harness.dataConnection.source.explore(user, source.rid);

            // Postgres's own catalogs (pg_catalog, information_schema) are listed too — reported, not asserted.
            expect(tables).toEqual(expect.arrayContaining([
                { schema: 'inventory', name: 'parts' },
                { schema: 'public', name: 'tools' },
            ]));
        });

        it("previews a table's first rows, with its columns typed as datasets type them", async () => {
            const preview = await harness.dataConnection.source.previewTable(user, source.rid, { schema: 'public', name: 'tools' }, 2);

            expect(preview.columns).toEqual([
                { name: 'id', type: 'integer' },
                { name: 'name', type: 'string' },
                { name: 'updated_at', type: 'timestamp' },
            ]);
            expect(preview.rows).toHaveLength(2);
            expect(preview.rows.map((row) => row[1])).toEqual(['hammer', 'saw']);
        });

        it("records each probe in the audit log, by what it did", async () => {
            const reads = (await harness.auditEvents(source.rid)).filter((event) => event.action === 'read');

            expect(reads.map((event) => event.detail.op)).toEqual(expect.arrayContaining(['test', 'explore', 'preview']));
        });

        it("a table that isn't there is the worker's error, passed on: 424", async () => {
            const preview = harness.dataConnection.source.previewTable(user, source.rid, { schema: 'public', name: 'missing' }, 2);

            await expect(preview).rejects.toBeInstanceOf(QueueJobError);
            await expect(preview).rejects.toMatchObject({ status: 424 });
        });
    });

    describe('a source that can\'t log in', () => {

        it('a wrong password fails the test, with the database\'s reason — and no password in it', async () => {
            const { source } = await harness.createSource(user, { ...login, password: 'wrong-password' });

            const tested = await harness.dataConnection.source.test(user, source.rid);

            expect(tested.ok).toBe(false);
            expect(tested.error).toMatch(/password authentication failed/);
            expect(tested.error).not.toContain('wrong-password');
        });

        it('a wrong password makes explore fail cleanly: 424 with the reason', async () => {
            const { source } = await harness.createSource(user, { ...login, password: 'wrong-password' });

            await expect(harness.dataConnection.source.explore(user, source.rid)).rejects.toMatchObject({
                status:  424,
                message: expect.stringMatching(/password authentication failed/),
            });
        });

        it("an unreachable host fails the test, saying it couldn't connect", async () => {
            const { source } = await harness.createSource(user, { ...login, host: '127.0.0.1', port: 1 });

            const tested = await harness.dataConnection.source.test(user, source.rid);

            expect(tested.ok).toBe(false);
            expect(tested.error).toMatch(/connect|refused/i);
        });
    });
});

// ── the "external" database ─────────────────────────────────────────────

/** A database with two tables in two schemas, and the login to reach it — the dev Postgres's own. */
async function createExternalDatabase(name: string): Promise<PostgresLogin> {
    const url = new URL(process.env.DATABASE_URL ?? '');
    const admin = new Client({ connectionString: withDatabase(url.toString(), 'postgres') });

    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();

    const client = new Client({ connectionString: withDatabase(url.toString(), name) });

    await client.connect();
    await client.query(`
        CREATE TABLE public.tools (id integer PRIMARY KEY, name text NOT NULL, updated_at timestamptz NOT NULL);
        INSERT INTO public.tools VALUES (1, 'hammer', '2026-10-01'), (2, 'saw', '2026-10-02'), (3, 'drill', '2026-10-03');
        CREATE SCHEMA inventory;
        CREATE TABLE inventory.parts (sku text PRIMARY KEY);`);
    await client.end();

    return {
        host:     url.hostname,
        port:     Number(url.port || 5432),
        database: name,
        user:     decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
    };
}

async function dropExternalDatabase(name: string): Promise<void> {
    const admin = new Client({ connectionString: withDatabase(process.env.DATABASE_URL ?? '', 'postgres') });

    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
}

// ── the worker ──────────────────────────────────────────────────────────

function startWorker(serverUrl: string, onOutput: (chunk: string) => void): ChildProcess {
    const cwd = path.resolve(__dirname, '../../../data-connection-worker');

    const child = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'], {
        cwd,
        env: {
            ...process.env,                     // REDIS_URL: the test Redis database (test/support/env.ts)
            QUARRY_SERVER_URL: serverUrl,
            WORKER_PORT:       '0',
            NO_COLOR:          '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));

    return child;
}

/** Polls until the condition holds, or fails with `describe()` after `timeoutMs`. */
async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, describe: () => string): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (!(await condition())) {
        if (Date.now() > deadline)
            throw new Error(describe());

        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
