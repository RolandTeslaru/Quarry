import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import axios, { type AxiosInstance } from 'axios';
import { SignJWT } from 'jose';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { Catalog, DataConnection, Dataset, Forge, Foundations, type Gatekeeper, Identity, Keychain, Library, Storage } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { destroyPool, useDatabaseLogin } from '@quarry/platform-kernel/db/pool';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { DataConnectionService } from '@quarry/data-connection-microservice/services/data-connection/data-connection.service';
import { SourceService } from '@quarry/data-connection-microservice/services/source/source.service';
import { SyncService } from '@quarry/data-connection-microservice/services/sync/sync.service';
import { DataConnectionMicroserviceModule } from '@quarry/data-connection-microservice/microservice.module';

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
 * test database and Redis — with the main server, Catalog and Forge running as processes
 * (test/support/global-setup.ts) for its microservice calls, as in production. Users, projects and grants
 * are the platform's to write: the fixtures write them through the owner's connection; credentials
 * and the datasets' versions through the main server's and Catalog's HTTP APIs, as the user.
 */
export class DataConnectionHarness {

    public readonly dataConnection: DataConnectionService;
    public readonly sources:        SourceService;
    public readonly syncs:          SyncService;
    /** Catalog, as Data Connection calls it — microservice calls, as the user or delegate. */
    public readonly catalog:        CatalogClient;
    public readonly library:        LibraryService;
    public readonly gatekeeper:     GatekeeperService;

    private constructor(
        private readonly app:   INestApplicationContext,
        private readonly owner: Kysely<unknown>,
    ) {
        this.dataConnection = app.get(DataConnectionService);
        this.sources = app.get(SourceService);
        this.syncs = app.get(SyncService);
        this.catalog = app.get(CatalogClient);
        this.library = app.get(LibraryService);
        this.gatekeeper = app.get(GatekeeperService);
    }

    public static async start(): Promise<DataConnectionHarness> {
        useDatabaseLogin({ url: requireEnv('DATA_CONNECTION_DATABASE_URL'), userRole: 'data_connection_user' });

        const owner = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 2 }) }) });

        return new DataConnectionHarness(await NestFactory.createApplicationContext(DataConnectionMicroserviceModule, { logger: false }), owner);
    }

    public async stop(): Promise<void> {
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

    /** A running job of the sync, started by the user: a build of its dataset, forced as a sync's run is, claimed as a ForgeAgent would. */
    public async runningJob(principal: Principal.User, sync: DataConnection.Sync): Promise<Forge.Job> {
        const { jobs } = await Forge.API.createBuild(await this.getApi(principal, requireEnv('FORGE_URL')), {
            branch:           Foundations.MAIN_BRANCH,
            fallbackBranches: [],
            target:           { type: 'manual', datasetRids: [sync.outputDatasetRid] },
            forceBuild:       true,
        });
        const [job] = Object.values(jobs);
        const agent = axios.create({ baseURL: requireEnv('FORGE_URL'), headers: { authorization: `Bearer ${requireEnv('FORGE_AGENT_TOKEN')}` } });

        return (await Forge.API.Agent.claim(agent, job.rid, { attempt: job.attempt })).job;
    }

    /** What computes the dataset on main — Forge's HTTP API, as the user; null if nothing does. */
    public async getCurrentRecipe(principal: Principal.User, datasetRid: Dataset.Rid): Promise<Forge.Recipe | null> {
        const { recipe } = await Forge.API.getCurrentRecipe(await this.getApi(principal, requireEnv('FORGE_URL')), { datasetRid, branch: Foundations.MAIN_BRANCH });

        return recipe;
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
            select payload from durable.outbox
             where queue_name = 'audit.record' and payload->>'resourceRid' = ${resourceRid} order by id`.execute(this.owner);

        return rows.map(({ payload }) => ({ user_rid: payload.userRid, action: payload.action, application_id: payload.applicationId, detail: payload.detail }));
    }

}

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`${name} is not set — tests need test/support/env.ts`);

    return value;
}
