import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import axios, { type AxiosInstance } from 'axios';
import { SignJWT } from 'jose';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { Foundations, type Gatekeeper, Identity, Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { destroyPool, useDatabaseLogin } from '@quarry/platform-kernel/db/pool';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { ExplorationService } from '@quarry/lineage-explorer-microservice/services/exploration/exploration.service';
import { LineageExplorerMicroserviceModule } from '@quarry/lineage-explorer-microservice/microservice.module';

/**
 * The Lineage Explorer service's modules in one Nest context, **on its own database login**, against
 * the test database and Redis. Users, projects and grants are the platform's to write: the fixtures
 * write them through the owner's connection.
 */
export class LineageExplorerHarness {

    public readonly explorations: ExplorationService;
    public readonly library:      LibraryService;

    private constructor(
        private readonly app:   INestApplicationContext,
        private readonly owner: Kysely<unknown>,
    ) {
        this.explorations = app.get(ExplorationService);
        this.library = app.get(LibraryService);
    }

    public static async start(): Promise<LineageExplorerHarness> {
        useDatabaseLogin({ url: requireEnv('LINEAGE_EXPLORER_DATABASE_URL'), userRole: 'lineage_explorer_user' });

        const owner = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 2 }) }) });

        return new LineageExplorerHarness(await NestFactory.createApplicationContext(LineageExplorerMicroserviceModule, { logger: false }), owner);
    }

    public async stop(): Promise<void> {
        await this.app.close();
        await destroyPool();
        await this.owner.destroy();
    }

    /** The main server's HTTP API, as the user — with a token signed as GoTrue's are. */
    public async getApi(principal: Principal.User): Promise<AxiosInstance> {
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(Foundations.Rid.parse(principal.userRid).locator)
            .setAudience('authenticated')
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(requireEnv('GOTRUE_JWT_SECRET')));

        return axios.create({ baseURL: requireEnv('QUARRY_SERVER_URL'), headers: { authorization: `Bearer ${token}` } });
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

    /** A folder per name: resources to draw, of a type this service's login may create. */
    public async createFolders(principal: Principal.User, parentRid: Library.Resource.Rid, names: string[]): Promise<Record<string, Library.Folder.Rid>> {
        const folders: Record<string, Library.Folder.Rid> = {};

        for (const name of names) {
            const folder = await this.library.createFolder(principal, { parentRid, name, description: null });

            folders[name] = folder.rid;
        }

        return folders;
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

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`${name} is not set`);

    return value;
}
