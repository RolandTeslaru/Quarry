import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import * as path from 'node:path';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import axios, { type AxiosInstance } from 'axios';
import { sql } from 'kysely';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Audit, Catalog, Identity, Library } from '@quarry/shared/domain';
import { MainServerModule } from '@/main-server.module';
import { SessionTokens } from '@/auth/session-tokens';
import { db, destroyPool } from '@quarry/platform-kernel/db/pool';
import { configureMainServer } from '@/http/main-server';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { MicroserviceCaller } from '@quarry/platform-kernel/microservice/microservice-caller';
import { MicroserviceCallsModule, connectMicroserviceCalls } from '@quarry/platform-kernel/microservice/microservice-calls.module';
import { getSubject } from '@quarry/platform-kernel/microservice/subjects';

/** Data Connection's side of a microservice call, in this process: its identity and Catalog's client. */
@Module({ imports: [MicroserviceCallsModule.forRoot({ service: 'data-connection' })], providers: [CatalogClient] })
class DataConnectionCaller {}

/** A service Catalog doesn't serve these calls to. */
@Module({ imports: [MicroserviceCallsModule.forRoot({ service: 'catalog' })], providers: [CatalogClient] })
class CatalogCaller {}

const SERVICE_BOOT_MS = 60_000;

/**
 * End to end, across processes (docs/design/architecture-split.md, phase 1): the main server, and the
 * Catalog service as a process of its own on its own database login. A user works with datasets
 * through the main server, which forwards to Catalog; the Library — the main server's — sees them.
 * And microservice calls over NATS (phase 2): Catalog serving Data Connection's calls, as the user, with a
 * token the main server minted — and refusing what a call may not do.
 */
describe('the Catalog service, through the main server', () => {

    let server: NestExpressApplication;
    let catalog: ChildProcess;
    let catalogLog = '';
    let api: AxiosInstance;
    let projectRid: Library.Project.Rid;
    let userRid: Identity.User.Rid;
    let dataConnection: INestApplicationContext;

    beforeAll(async () => {
        const catalogPort = await getFreePort();

        server = await NestFactory.create<NestExpressApplication>(MainServerModule, { logger: false });
        configureMainServer(server, { catalog: `http://127.0.0.1:${catalogPort}`, dataConnection: 'http://127.0.0.1:9', forge: 'http://127.0.0.1:9', codeWorkspace: 'http://127.0.0.1:9', lineageExplorer: 'http://127.0.0.1:9' });
        await connectMicroserviceCalls(server, 'main');
        await server.listen(0, '127.0.0.1');

        const { port } = server.getHttpServer().address() as AddressInfo;

        // Services in this process ask this main server for their tokens.
        process.env.QUARRY_SERVER_URL = `http://127.0.0.1:${port}`;

        catalog = startCatalog(`http://127.0.0.1:${port}`, catalogPort, (chunk) => catalogLog += chunk);
        await waitFor(() => catalogLog.includes('Catalog listening'), SERVICE_BOOT_MS, () => `the Catalog service didn't start:\n${catalogLog}`);

        userRid = Identity.User.fromAuthId(randomUUID());
        projectRid = Library.Project.createRid();

        await sql`insert into identity."user" (rid, email, display_name, workspace_role) values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', 'member')`.execute(db());
        await sql`insert into library.resource (rid, type, name, created_by) values (${projectRid}, 'project', ${`E2E ${randomUUID()}`}, ${userRid})`.execute(db());
        await sql`insert into gatekeeper.role_grant (resource_rid, user_rid, role) values (${projectRid}, ${userRid}, 'editor')`.execute(db());

        api = axios.create({
            baseURL: `http://127.0.0.1:${port}`,
            headers: { authorization: `Bearer ${await new SessionTokens().mint(userRid, 'e2e')}` },
        });
    }, SERVICE_BOOT_MS + 30_000);

    afterAll(async () => {
        await dataConnection?.close();
        catalog?.kill('SIGTERM');
        await server?.close();
        await destroyPool();
    });

    it('uploads a CSV into a new dataset, reads it back, and the Library lists it', async () => {
        const file = new Blob(['id,amount\n1,10\n2,20\n3,30\n'], { type: 'text/csv' });

        const { dataset, schema } = await Catalog.API.Dataset.createFromFile(api, { parentRid: projectRid }, file, 'orders.csv');

        expect(dataset).toMatchObject({ name: 'orders', parentRid: projectRid });
        expect(schema.columns.map((column) => column.name)).toEqual(['id', 'amount']);

        const preview = await Catalog.API.Dataset.preview(api, dataset.rid);

        expect(preview.rows.map((row) => row.map(String))).toEqual([['1', '10'], ['2', '20'], ['3', '30']]);

        // The Library is the main server's own: it reads the row the Catalog service wrote.
        const { children } = await Library.API.Resource.children(api, projectRid);

        expect(children.map((child) => child.rid)).toContain(dataset.rid);
    });

    it("records an open through the outbox, in the Catalog service's transaction", async () => {
        const file = new Blob(['a\n1\n'], { type: 'text/csv' });
        const { dataset } = await Catalog.API.Dataset.createFromFile(api, { parentRid: projectRid, name: 'opened' }, file, 'opened.csv');

        await Catalog.API.Dataset.open(api, dataset.rid, { application: 'datasets' });

        const { rows } = await sql<{ payload: Audit.Queue.Record.Job }>`
            select payload from foundations.outbox
             where queue_name = ${Audit.Queue.Record.Definition.name} and payload->>'resourceRid' = ${dataset.rid}`.execute(db());

        expect(rows.map((row) => row.payload)).toEqual([expect.objectContaining({ userRid, action: 'open', applicationId: 'datasets' })]);
    });

    it("refuses what the user can't do, as the Catalog service decides it", async () => {
        const otherProject = Library.Project.createRid();

        await sql`insert into library.resource (rid, type, name) values (${otherProject}, 'project', ${`Other ${randomUUID()}`})`.execute(db());

        const attempt = Catalog.API.Dataset.create(api, { parentRid: otherProject, name: 'nope', description: null });

        await expect(attempt).rejects.toMatchObject({ response: { status: 404 } });
    });

    describe('microservice calls, over NATS', () => {

        let catalogFromDataConnection: CatalogClient;

        beforeAll(async () => {
            dataConnection = await NestFactory.createApplicationContext(DataConnectionCaller, { logger: false });
            catalogFromDataConnection = dataConnection.get(CatalogClient);
        });

        const user = (): Principal.User => ({ type: 'user', userRid, workspaceRole: 'member' });

        it("creates a dataset for the user — the main server mints the user's token — and the dataset is theirs to read", async () => {
            const dataset = await catalogFromDataConnection.createDataset(user(), { parentRid: projectRid, name: `called ${randomUUID().slice(0, 8)}`, description: null });

            expect(dataset.parentRid).toBe(projectRid);
            await expect(catalogFromDataConnection.get(user(), { rid: dataset.rid })).resolves.toMatchObject({ rid: dataset.rid });
        });

        it("acts as a delegate: a run's transaction, opened for the user, records who opened it", async () => {
            const dataset = await catalogFromDataConnection.createDataset(user(), { parentRid: projectRid, name: `delegated ${randomUUID().slice(0, 8)}`, description: null });
            const transaction = await catalogFromDataConnection.openTransaction(Principal.delegate(userRid, 'sync:e2e'), { datasetRid: dataset.rid, type: 'snapshot', provenance: { test: true } });

            expect(transaction).toMatchObject({ datasetRid: dataset.rid, status: 'open' });

            // As the calling service itself: cleanup that works whatever the user may do.
            await catalogFromDataConnection.abortTransaction(Principal.SELF('e2e cleanup'), { datasetRid: dataset.rid, transactionRid: transaction.rid });
        });

        it("refuses as the user would be refused: Gatekeeper decides on Catalog's side", async () => {
            const otherProject = Library.Project.createRid();

            await sql`insert into library.resource (rid, type, name) values (${otherProject}, 'project', ${`Other ${randomUUID()}`})`.execute(db());

            await expect(catalogFromDataConnection.createDataset(user(), { parentRid: otherProject, name: 'nope', description: null }))
                .rejects.toMatchObject({ status: 404 });
        });

        it('refuses a service the call is not for, and a token no one signed', async () => {
            const catalogCaller = await NestFactory.createApplicationContext(CatalogCaller, { logger: false });

            try {
                await expect(catalogCaller.get(CatalogClient).get(Principal.SELF('e2e'), { rid: projectRid.replace('library.main.project', 'catalog.main.dataset') as never }))
                    .rejects.toMatchObject({ status: 403 });
            }
            finally {
                await catalogCaller.close();
            }

            const forged = { serviceToken: 'not.a.token', actingAs: { type: 'service', reason: 'forged' }, request: { rid: projectRid } };
            const caller = dataConnection.get(MicroserviceCaller) as unknown as { getClient(): { send(pattern: string, data: unknown): import('rxjs').Observable<unknown> } };

            await expect(firstValueFrom(caller.getClient().send(getSubject(Catalog.Microservice.Get.PATTERN), forged))).rejects.toMatchObject({ status: 401 });
        });
    });
});

function startCatalog(serverUrl: string, port: number, onOutput: (chunk: string) => void): ChildProcess {
    const child = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'], {
        cwd: path.resolve(__dirname, '../../../../applications/catalog/microservice'),
        env: {
            ...process.env,                     // the test database and Redis, and CATALOG_DATABASE_URL (test/support/env.ts)
            QUARRY_SERVER_URL: serverUrl,
            CATALOG_PORT:      String(port),
            NO_COLOR:          '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));

    return child;
}

function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const probe = createServer();

        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address() as AddressInfo;

            probe.close(() => resolve(port));
        });
    });
}

/** Until the condition holds; the description is the error if it never does. */
async function waitFor(condition: () => boolean, timeoutMs: number, describe: () => string): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (!condition()) {
        if (Date.now() > deadline)
            throw new Error(describe());

        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
