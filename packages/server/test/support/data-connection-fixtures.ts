import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { Catalog, DataConnection, Dataset, type Gatekeeper, Identity, type Keychain, type Library, Storage } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { ApiModule } from '@/api.module';
import type { Principal } from '@/auth/principal';
import { db, destroyPool } from '@/db/pool';
import { FileStorage } from '@/infra/file-storage';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { DataConnectionService } from '@/services/DataConnection/data-connection.service';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { KeychainService } from '@/services/Keychain/keychain.service';
import { LibraryService } from '@/services/Library/library.service';

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
 * The server's services in one Nest context, against the test database, Redis
 * and bucket (test/support/env.ts), plus what Data Connection tests need around
 * them. **The test plays the Data Connection worker**: it calls the run
 * lifecycle (start, heartbeat, complete, fail) itself, writing the files a
 * real copy would — so the order is the test's, with no worker process and no sleeps.
 */
export class DataConnectionHarness {

    public readonly dataConnection: DataConnectionService;
    public readonly catalog:        CatalogService;
    public readonly library:        LibraryService;
    public readonly keychain:       KeychainService;
    public readonly gatekeeper:     GatekeeperService;
    public readonly files:          FileStorage;

    /** The sync queue, to see what "run now" and the schedules enqueue. */
    public readonly syncJobs = new Queue(DataConnection.Queue.Sync.Definition.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });

    /** Every prefix a test wrote files under — deleted on stop. */
    private readonly written = new Set<string>();

    private constructor(private readonly app: INestApplicationContext) {
        this.dataConnection = app.get(DataConnectionService);
        this.catalog = app.get(CatalogService);
        this.library = app.get(LibraryService);
        this.keychain = app.get(KeychainService);
        this.gatekeeper = app.get(GatekeeperService);
        this.files = app.get(FileStorage);
    }

    public static async start(): Promise<DataConnectionHarness> {
        return new DataConnectionHarness(await NestFactory.createApplicationContext(ApiModule, { logger: false }));
    }

    public async stop(): Promise<void> {
        for (const prefix of this.written)
            await this.files.deletePrefix(prefix);

        await this.syncJobs.close();
        await this.app.close();
        await destroyPool();
    }

    // ── people and places ───────────────────────────────────────────────

    /** A workspace member (an admin by default: owner of everything), inserted directly. */
    public async createUser(workspaceRole: Identity.User.WorkspaceRole = 'admin'): Promise<Principal.User> {
        const userRid = Identity.User.fromAuthId(randomUUID());

        await sql`
            insert into identity."user" (rid, email, display_name, workspace_role)
            values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', ${workspaceRole})`.execute(db());

        return { type: 'user', userRid, workspaceRole };
    }

    /** Gives a member a role on a resource (and everything under it), as `granter`. */
    public async grant(granter: Principal.User, resourceRid: Library.Resource.Rid, member: Principal.User, role: Gatekeeper.Role.Name): Promise<void> {
        await this.gatekeeper.grant(granter, resourceRid, { type: 'user', userRid: member.userRid }, role);
    }

    public async createProject(principal: Principal.User): Promise<Library.Resource.Rid> {
        const project = await this.library.createProject(principal, { name: `Test ${randomUUID()}`, description: null });

        return project.rid;
    }

    /** A Postgres credential in the folder. */
    public async createCredential(principal: Principal.User, parentRid: Library.Resource.Rid, login: PostgresLogin = NOWHERE): Promise<Keychain.Credential.Schema> {
        return this.keychain.create(principal, {
            parentRid,
            name:        `Login ${randomUUID()}`,
            description: null,
            templateId:  'postgres',
            values:      { ...login, ssl: false },
        });
    }

    /** A project with a Postgres source in it (and its credential, beside it). */
    public async createSource(
        principal: Principal.User,
        login:     PostgresLogin = NOWHERE,
    ): Promise<{ projectRid: Library.Resource.Rid; credential: Keychain.Credential.Schema; source: DataConnection.Source.Schema }> {
        const projectRid = await this.createProject(principal);
        const credential = await this.createCredential(principal, projectRid, login);
        const source = await this.dataConnection.source.create(principal, {
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
        source:    DataConnection.Source.Schema,
        options:   { schedule?: string | null; snapshot?: boolean } = {},
    ): Promise<DataConnection.Sync.Schema> {
        return this.dataConnection.sync.create(principal, source.rid, {
            name:     `Sync ${randomUUID()}`,
            config:   options.snapshot ? { kind: 'table', table: 'tools' } : { kind: 'table', table: 'tools', incrementalColumn: 'updated_at' },
            schedule: options.schedule ?? null,
            output:   { parentRid: source.parentRid, name: `Raw ${randomUUID()}` },
        });
    }

    // ── playing the worker ──────────────────────────────────────────────

    /** The worker starts a run — as the scheduler would for `triggeredBy: null`. Throws if it was skipped. */
    public async startRun(sync: DataConnection.Sync.Schema, triggeredBy: Principal.User | null): Promise<StartedRun> {
        const started = await this.dataConnection.run.start({
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
        return this.dataConnection.run.complete(run.runRid, await this.writeCopy(run, rowsPerFile, state));
    }

    /** Puts an object anywhere in the bucket — to check nothing outside a run's prefix is registered. */
    public async writeObject(key: string): Promise<void> {
        this.written.add(key);
        await this.files.upload(Storage.File.Key.parse(key), Readable.from(Buffer.from('stray')), 'application/vnd.apache.parquet');
    }

    // ── reading what happened ───────────────────────────────────────────

    /** The sync's runs, newest first, as its creator sees them. */
    public async runs(principal: Principal.User, sync: DataConnection.Sync.Schema): Promise<DataConnection.SyncRun.Schema[]> {
        return this.dataConnection.run.list(principal, sync.sourceRid, sync.rid);
    }

    public async run(principal: Principal.User, sync: DataConnection.Sync.Schema, runRid: DataConnection.SyncRun.Rid): Promise<DataConnection.SyncRun.Schema> {
        const found = (await this.runs(principal, sync)).find((run) => run.rid === runRid);

        if (!found)
            throw new Error(`Run ${runRid} not found`);

        return found;
    }

    /** The output dataset's current version on main. */
    public async view(principal: Principal.User, datasetRid: Dataset.Rid): Promise<Dataset.View.Schema> {
        return this.catalog.view(principal, datasetRid);
    }

    /** The status of a Catalog transaction (Data Connection can't read them; the test can). */
    public async transactionStatus(rid: Catalog.Transaction.Rid): Promise<string | undefined> {
        const { rows } = await sql<{ status: string }>`select status from catalog.transaction where rid = ${rid}`.execute(db());

        return rows[0]?.status;
    }

    /** How many transactions are open on a dataset. */
    public async openTransactions(datasetRid: Dataset.Rid): Promise<number> {
        const { rows } = await sql<{ n: number }>`
            select count(*)::int as n from catalog.transaction where dataset_rid = ${datasetRid} and status = 'open'`.execute(db());

        return rows[0].n;
    }

    /** Whether a Catalog transaction replaces the view (snapshot) or adds to it (append). */
    public async transactionType(rid: Catalog.Transaction.Rid): Promise<string | undefined> {
        const { rows } = await sql<{ type: string }>`select type from catalog.transaction where rid = ${rid}`.execute(db());

        return rows[0]?.type;
    }

    /** The audit log's events on a resource, oldest first. */
    public async auditEvents(resourceRid: string): Promise<{ user_rid: string; action: string; application_id: string | null; detail: Record<string, unknown> }[]> {
        const { rows } = await sql<{ user_rid: string; action: string; application_id: string | null; detail: Record<string, unknown> }>`
            select user_rid, action, application_id, detail from audit.access_event where resource_rid = ${resourceRid} order by id`.execute(db());

        return rows;
    }

    // ── simulating what the code can't produce on demand ────────────────

    /** A worker that stopped heartbeating `minutes` ago. */
    public async backdateHeartbeat(runRid: DataConnection.SyncRun.Rid, minutes: number): Promise<void> {
        await sql`update data_connection.sync_run set heartbeat_at = now() - make_interval(mins => ${minutes}) where rid = ${runRid}`.execute(db());
    }
}
