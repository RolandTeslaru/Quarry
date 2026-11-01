import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import axios, { type AxiosInstance } from 'axios';
import { Queue } from 'bullmq';
import { SignJWT } from 'jose';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { Catalog, DataConnection, Dataset, Foundations, type Gatekeeper, Identity, Keychain, Library, Storage } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { destroyPool, useDatabaseLogin } from '@quarry/platform-kernel/db/pool';
import { FileStorage } from '@quarry/platform-kernel/infra/file-storage';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { SourceService } from '@quarry/data-connection-microservice/source/source.service';
import { SyncService } from '@quarry/data-connection-microservice/sync/sync.service';
import { SyncRunService } from '@quarry/data-connection-microservice/sync-run/sync-run.service';
import { DataConnectionMicroserviceModule } from '@quarry/data-connection-microservice/microservice.module';

import Internal = DataConnection.API.Internal;

/** A started run, as the Data Connection worker gets it. */
export type StartedRun = Extract<Internal.StartRun.Response, { skipped: false }>;

/** The Postgres credential's values a source logs in with. Defaults: nothing listens there — fine unless something connects. */
export interface PostgresLogin {
    readonly host:     string;
    readonly port:     number;
    readonly database: string;
    readonly user:     string;
    readonly password: string;
}

const NOWHERE: PostgresLogin = { host: '127.0.0.1', port: 1, database: 'nowhere', user: 'nobody', password: 'secret-that-must-not-leak' };

/**
 * The Data Connection service's modules in one Nest context, **on its own database login**, against the
 * test database, Redis and bucket — with the main server and Catalog running as processes
 * (test/support/global-setup.ts) for its microservice calls, as in production. Users, projects and grants
 * are the platform's to write: the fixtures write them through the owner's connection; credentials
 * and the datasets' versions through the main server's and Catalog's HTTP APIs, as the user.
 * **The test plays the Data Connection worker**: it calls the run lifecycle (start, heartbeat,
 * complete, fail) itself, writing the files a real copy would — the order is the test's, no worker
 * process, no sleeps.
 */
export class DataConnectionHarness {

    public readonly sources:        SourceService;
    public readonly syncs:          SyncService;
    public readonly syncRuns:       SyncRunService;
    /** Catalog, as Data Connection calls it — microservice calls, as the user or delegate. */
    public readonly catalog:        CatalogClient;
    public readonly library:        LibraryService;
    public readonly gatekeeper:     GatekeeperService;
    public readonly files:          FileStorage;

    /** The sync queue, to see what "run now" and the schedules enqueue. */
    public readonly syncJobs = new Queue(DataConnection.Queue.Sync.Definition.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });

    /** Every prefix a test wrote files under — deleted on stop. */
    private readonly written = new Set<string>();

    private constructor(
        private readonly app:   INestApplicationContext,
        private readonly owner: Kysely<unknown>,
    ) {
        this.sources = app.get(SourceService);
        this.syncs = app.get(SyncService);
        this.syncRuns = app.get(SyncRunService);
        this.catalog = app.get(CatalogClient);
        this.library = app.get(LibraryService);
        this.gatekeeper = app.get(GatekeeperService);
        this.files = app.get(FileStorage);
    }

    public static async start(): Promise<DataConnectionHarness> {
        useDatabaseLogin({ url: requireEnv('DATA_CONNECTION_DATABASE_URL'), userRole: 'data_connection_user' });

        const owner = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 2 }) }) });

        return new DataConnectionHarness(await NestFactory.createApplicationContext(DataConnectionMicroserviceModule, { logger: false }), owner);
    }

    public async stop(): Promise<void> {
        for (const prefix of this.written)
            await this.files.deletePrefix(prefix);

        await this.syncJobs.close();
        await this.app.close();
        await destroyPool();
        await this.owner.destroy();
    }

    /** The main server's or a service's HTTP API, as the user — with a token signed as GoTrue's are. */
    public async getApi(principal: Principal.User, baseURL = requireEnv('QUARRY_SERVER_URL')): Promise<AxiosInstance> {
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(Foundations.Rid.parse(principal.userRid).locator)
            .setAudience('authenticated')
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(requireEnv('GOTRUE_JWT_SECRET')));

        return axios.create({ baseURL, headers: { authorization: `Bearer ${token}` } });
    }

    // ── people and places ───────────────────────────────────────────────

    /** A workspace member (an admin by default: owner of everything), inserted directly. */
    public async createUser(workspaceRole: Identity.User.WorkspaceRole = 'admin'): Promise<Principal.User> {
        const userRid = Identity.User.fromAuthId(randomUUID());

        await sql`
            insert into identity."user" (rid, email, display_name, workspace_role)
            values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', ${workspaceRole})`.execute(this.owner);

        return { type: 'user', userRid, workspaceRole };
    }

    /** Gives a member a role on a resource (and everything under it), as `granter` — granting is the main server's; the owner writes it here. */
    public async grant(granter: Principal.User, resourceRid: Library.Resource.Rid, member: Principal.User, role: Gatekeeper.Role.Name): Promise<void> {
        await sql`
            insert into gatekeeper.role_grant (resource_rid, user_rid, role, granted_by)
            values (${resourceRid}, ${member.userRid}, ${role}, ${granter.userRid})`.execute(this.owner);
    }

    /** A project — the Library's, in the main server; the owner writes it here. */
    public async createProject(principal: Principal.User): Promise<Library.Resource.Rid> {
        const rid = Library.Project.createRid();

        await sql`
            insert into library.resource (rid, type, name, created_by)
            values (${rid}, 'project', ${`Test ${randomUUID()}`}, ${principal.userRid})`.execute(this.owner);

        return rid;
    }

    /** A Postgres credential in the folder, through Keychain — the main server's HTTP API, as the user. */
    public async createCredential(principal: Principal.User, parentRid: Library.Resource.Rid, login: PostgresLogin = NOWHERE): Promise<Keychain.Credential> {
        const { credential } = await Keychain.API.Credential.create(await this.getApi(principal), {
            parentRid,
            name:        `Login ${randomUUID()}`,
            description: null,
            templateId:  'postgres',
            values:      { ...login, ssl: false },
        });

        return credential;
    }

    /** Trashes a resource whatever its type — the Library app's, in the main server; the owner writes it here. */
    public async trash(principal: Principal.User, rid: Library.Resource.Rid): Promise<void> {
        await sql`update library.resource set trashed_at = now(), trashed_by = ${principal.userRid} where rid = ${rid}`.execute(this.owner);
    }

    /** A project with a Postgres source in it (and its credential, beside it). */
    public async createSource(
        principal: Principal.User,
        login:     PostgresLogin = NOWHERE,
    ): Promise<{ projectRid: Library.Resource.Rid; credential: Keychain.Credential; source: DataConnection.Source }> {
        const projectRid = await this.createProject(principal);
        const credential = await this.createCredential(principal, projectRid, login);
        const source = await this.sources.create(principal, {
            parentRid:       projectRid,
            name:            `Source ${randomUUID()}`,
            description:     null,
            definitionId:    'postgres',
            config:          {},
            credentialRid:   credential.rid,
            outputFolderRid: null,
        });

        return { projectRid, credential, source };
    }

    /** A sync of `public.tools` into a new dataset next to the source — append (incremental) unless asked for a snapshot. */
    public async createSync(
        principal: Principal.User,
        source:    DataConnection.Source,
        options:   { schedule?: string | null; snapshot?: boolean } = {},
    ): Promise<DataConnection.Sync> {
        return this.syncs.create(principal, source.rid, {
            name:     `Sync ${randomUUID()}`,
            config:   options.snapshot ? { kind: 'table', table: 'tools' } : { kind: 'table', table: 'tools', incrementalColumn: 'updated_at' },
            schedule: options.schedule ?? null,
            output:   { parentRid: source.parentRid, name: `Raw ${randomUUID()}` },
        });
    }

    // ── playing the worker ──────────────────────────────────────────────

    /** The worker starts a run — as the scheduler would for `triggeredBy: null`. Throws if it was skipped. */
    public async startRun(sync: DataConnection.Sync, triggeredBy: Principal.User | null): Promise<StartedRun> {
        const started = await this.syncRuns.start({
            syncRid:     sync.rid,
            trigger:     triggeredBy ? 'manual' : 'schedule',
            triggeredBy: triggeredBy?.userRid ?? null,
        });

        if (started.skipped)
            throw new Error(`Run of ${sync.rid} was skipped`);

        return started;
    }

    /**
     * Writes what a copy would — one object per entry, under the run's
     * destination — and returns the request `complete` takes. The objects
     * aren't real Parquet: the server only lists them, by key and extension.
     */
    public async writeCopy(run: StartedRun, rowsPerFile: number[], state: string | null): Promise<Internal.CompleteRun.Request> {
        const prefix = Dataset.getStoragePrefix(run.datasetRid, run.transactionRid);
        const rowCounts: Record<string, number> = {};

        this.written.add(prefix);

        for (const [index, rows] of rowsPerFile.entries()) {
            const key = Dataset.getStorageKey(run.datasetRid, run.transactionRid, `data_${index}.parquet`);

            await this.files.upload(key, Readable.from(Buffer.from(`rows:${rows}`)), 'application/vnd.apache.parquet');
            rowCounts[key] = rows;
        }

        return {
            rowCount: rowsPerFile.reduce((sum, rows) => sum + rows, 0),
            state,
            schema:   { columns: [{ name: 'id', type: 'long', nullable: false }], reader: { format: 'parquet' } },
            rowCounts,
        };
    }

    /** Writes a copy of these files and completes the run with it. */
    public async completeRun(run: StartedRun, rowsPerFile: number[], state: string | null): Promise<Internal.CompleteRun.Response> {
        return this.syncRuns.complete(run.runRid, await this.writeCopy(run, rowsPerFile, state));
    }

    /** Puts an object anywhere in the bucket — to check nothing outside a run's prefix is registered. */
    public async writeObject(key: string): Promise<void> {
        this.written.add(key);
        await this.files.upload(Storage.File.Key.parse(key), Readable.from(Buffer.from('stray')), 'application/vnd.apache.parquet');
    }

    // ── reading what happened ───────────────────────────────────────────

    /** The sync's runs, newest first, as its creator sees them. */
    public async runs(principal: Principal.User, sync: DataConnection.Sync): Promise<DataConnection.SyncRun[]> {
        return this.syncRuns.list(principal, sync.sourceRid, sync.rid);
    }

    public async run(principal: Principal.User, sync: DataConnection.Sync, runRid: DataConnection.SyncRun.Rid): Promise<DataConnection.SyncRun> {
        const found = (await this.runs(principal, sync)).find((run) => run.rid === runRid);

        if (!found)
            throw new Error(`Run ${runRid} not found`);

        return found;
    }

    /** The output dataset's current version on main — Catalog's HTTP API, as the user. */
    public async view(principal: Principal.User, datasetRid: Dataset.Rid): Promise<Dataset.View> {
        const { view } = await Catalog.API.Dataset.getView(await this.getApi(principal, requireEnv('CATALOG_URL')), datasetRid);

        return view;
    }

    /** The status of a Catalog transaction (Data Connection can't read them; the test can). */
    public async transactionStatus(rid: Catalog.Transaction.Rid): Promise<string | undefined> {
        const { rows } = await sql<{ status: string }>`select status from catalog.transaction where rid = ${rid}`.execute(this.owner);

        return rows[0]?.status;
    }

    /** How many transactions are open on a dataset. */
    public async openTransactions(datasetRid: Dataset.Rid): Promise<number> {
        const { rows } = await sql<{ n: number }>`
            select count(*)::int as n from catalog.transaction where dataset_rid = ${datasetRid} and status = 'open'`.execute(this.owner);

        return rows[0].n;
    }

    /** Whether a Catalog transaction replaces the view (snapshot) or adds to it (append). */
    public async transactionType(rid: Catalog.Transaction.Rid): Promise<string | undefined> {
        const { rows } = await sql<{ type: string }>`select type from catalog.transaction where rid = ${rid}`.execute(this.owner);

        return rows[0]?.type;
    }

    /**
     * The audit records on a resource, oldest first — as this service queued them in the outbox: the
     * system worker hands them to the main server to store, and neither runs in these tests.
     */
    public async auditEvents(resourceRid: string): Promise<{ user_rid: string; action: string; application_id: string | null; detail: Record<string, unknown> }[]> {
        const { rows } = await sql<{ payload: { userRid: string; action: string; applicationId: string | null; detail: Record<string, unknown> } }>`
            select payload from foundations.outbox
             where queue_name = 'audit.record' and payload->>'resourceRid' = ${resourceRid} order by id`.execute(this.owner);

        return rows.map(({ payload }) => ({ user_rid: payload.userRid, action: payload.action, application_id: payload.applicationId, detail: payload.detail }));
    }

    // ── simulating what the code can't produce on demand ────────────────

    /** A worker that stopped heartbeating `minutes` ago. */
    public async backdateHeartbeat(runRid: DataConnection.SyncRun.Rid, minutes: number): Promise<void> {
        await sql`update data_connection.sync_run set heartbeat_at = now() - make_interval(mins => ${minutes}) where rid = ${runRid}`.execute(this.owner);
    }
}

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`${name} is not set — tests need test/support/env.ts`);

    return value;
}
