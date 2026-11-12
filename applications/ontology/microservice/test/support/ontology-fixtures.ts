import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import axios, { type AxiosInstance } from 'axios';
import { SignJWT } from 'jose';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { Catalog, type Dataset, Foundations, type Gatekeeper, Identity, Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { RequestIdentity } from '@quarry/platform-kernel/auth/request-identity';
import { destroyPool, useDatabaseLogin } from '@quarry/platform-kernel/db/pool';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { ObjectTypeService } from '@quarry/ontology-microservice/services/object-type/object-type.service';
import { LinkTypeService } from '@quarry/ontology-microservice/services/link-type/link-type.service';
import { OntologyMicroserviceModule } from '@quarry/ontology-microservice/microservice.module';

/**
 * The Ontology service's modules in one Nest context, **on its own database login**, against the test
 * database and Redis; Catalog is the process the global setup started. Users, projects and grants are the
 * platform's to write: the fixtures write them through the owner's connection.
 */
export class OntologyHarness {

    public readonly objectTypes: ObjectTypeService;
    public readonly linkTypes:   LinkTypeService;
    public readonly library:     LibraryService;

    private constructor(
        private readonly app:   INestApplicationContext,
        private readonly owner: Kysely<unknown>,
    ) {
        this.objectTypes = app.get(ObjectTypeService);
        this.linkTypes = app.get(LinkTypeService);
        this.library = app.get(LibraryService);
    }

    public static async start(): Promise<OntologyHarness> {
        useDatabaseLogin({ url: requireEnv('ONTOLOGY_DATABASE_URL'), userRole: 'ontology_user' });

        const owner = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 2 }) }) });

        return new OntologyHarness(await NestFactory.createApplicationContext(OntologyMicroserviceModule, { logger: false }), owner);
    }

    public async stop(): Promise<void> {
        await this.app.close();
        await destroyPool();
        await this.owner.destroy();
    }

    /** The main server's or a service's HTTP API, as the user. */
    public async getApi(principal: Principal.User, baseURL = requireEnv('QUARRY_SERVER_URL')): Promise<AxiosInstance> {
        return axios.create({ baseURL, headers: { authorization: `Bearer ${await signToken(principal)}` } });
    }

    /**
     * Runs a service call as if in the user's request: what it asks Catalog then carries their token, as
     * on a real request — this service never mints users' tokens.
     */
    public async as<R>(principal: Principal.User, call: () => Promise<R>): Promise<R> {
        const token = await signToken(principal);

        return RequestIdentity.run({ userRid: principal.userRid, token }, call);
    }

    /** A workspace member (an admin by default: owner of everything), inserted directly. */
    public async createUser(workspaceRole: Identity.User.WorkspaceRole = 'admin'): Promise<Principal.User> {
        const userRid = Identity.User.fromAuthId(randomUUID());

        await sql`
            insert into identity."user" (rid, email, display_name, workspace_role)
            values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', ${workspaceRole})`.execute(this.owner);

        return { type: 'user', userRid, workspaceRole };
    }

    /** The Library's, in the main server: the owner writes it here. */
    public async createProject(principal: Principal.User): Promise<Library.Project.Rid> {
        const projectRid = Library.Project.createRid();

        await sql`
            insert into library.resource (rid, type, name, created_by)
            values (${projectRid}, 'project', ${`Test ${randomUUID()}`}, ${principal.userRid})`.execute(this.owner);

        return projectRid;
    }

    /** A dataset in Catalog, with one version from this CSV — or none, for an empty dataset. */
    public async createDataset(principal: Principal.User, parentRid: Library.Resource.Rid, name: string, csv: string | null): Promise<Dataset.Rid> {
        const { dataset } = await Catalog.API.Dataset.create(await this.getApi(principal), { parentRid, name, description: null });

        if (csv !== null)
            await this.upload(principal, dataset.rid, csv);

        return dataset.rid;
    }

    /** A new version of the dataset: this CSV, as a snapshot — its columns and types sniffed. */
    public async upload(principal: Principal.User, datasetRid: Dataset.Rid, csv: string): Promise<void> {
        await Catalog.API.Dataset.upload(await this.getApi(principal, requireEnv('CATALOG_URL')), datasetRid, { mode: 'snapshot' }, new Blob([csv]), `${randomUUID()}.csv`);
    }

    /** Gives a member a role on a resource (and everything under it); the owner writes it here. */
    public async grant(granter: Principal.User, resourceRid: Library.Resource.Rid, member: Principal.User, role: Gatekeeper.Role.Name): Promise<void> {
        await sql`
            insert into gatekeeper.role_grant (resource_rid, user_rid, role, granted_by)
            values (${resourceRid}, ${member.userRid}, ${role}, ${granter.userRid})`.execute(this.owner);
    }

    /** Trashes a resource whatever its type; the owner writes it here. */
    public async trash(principal: Principal.User, rid: Library.Resource.Rid): Promise<void> {
        await sql`update library.resource set trashed_at = now(), trashed_by = ${principal.userRid} where rid = ${rid}`.execute(this.owner);
    }
}

/** A token for the user, signed as GoTrue's are. */
function signToken(principal: Principal.User): Promise<string> {
    return new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(Foundations.Rid.parse(principal.userRid).locator)
        .setAudience('authenticated')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(requireEnv('GOTRUE_JWT_SECRET')));
}

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`${name} is not set — tests need test/support/env.ts`);

    return value;
}
