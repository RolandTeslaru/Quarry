import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { type Catalog, type Dataset, Identity, Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogMicroserviceModule } from '@quarry/catalog-server/microservice.module';
import { destroyPool, useDatabaseLogin } from '@quarry/platform-kernel/db/pool';
import { CatalogService } from '@quarry/catalog-server/catalog/catalog.service';
import { TransactionService } from '@quarry/catalog-server/transaction/transaction.service';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';

/**
 * The Catalog service's modules in one Nest context, **on its own database login** — catalog_service,
 * and catalog_user for a user's transaction — as the service runs (catalog-service.ts). Users and
 * projects are the platform's to write, so the fixtures write them through the owner's connection.
 */
export class CatalogHarness {

    public readonly catalog: CatalogService;
    public readonly transaction: TransactionService;
    public readonly library: LibraryService;

    private constructor(
        private readonly app:   INestApplicationContext,
        private readonly owner: Kysely<unknown>,
    ) {
        this.catalog = app.get(CatalogService);
        this.transaction = app.get(TransactionService);
        this.library = app.get(LibraryService);
    }

    public static async start(): Promise<CatalogHarness> {
        useDatabaseLogin({ url: requireEnv('CATALOG_DATABASE_URL'), userRole: 'catalog_user' });

        const owner = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 2 }) }) });

        return new CatalogHarness(await NestFactory.createApplicationContext(CatalogMicroserviceModule, { logger: false }), owner);
    }

    public async stop(): Promise<void> {
        await this.app.close();
        await destroyPool();
        await this.owner.destroy();
    }

    /** A workspace member (an admin by default: owner of everything), inserted by the owner. */
    public async createUser(workspaceRole: Identity.User.WorkspaceRole = 'admin'): Promise<Principal.User> {
        const userRid = Identity.User.fromAuthId(randomUUID());

        await sql`
            insert into identity."user" (rid, email, display_name, workspace_role)
            values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', ${workspaceRole})`.execute(this.owner);

        return { type: 'user', userRid, workspaceRole };
    }

    /** A project, inserted by the owner — the Catalog service can't create one. */
    public async createProject(principal: Principal.User): Promise<Library.Project.Rid> {
        const rid = Library.Project.createRid();

        await sql`
            insert into library.resource (rid, type, name, created_by)
            values (${rid}, 'project', ${`Test ${randomUUID()}`}, ${principal.userRid})`.execute(this.owner);

        return rid;
    }

    /** A project with a dataset per name, the datasets created by the Catalog service as the user. */
    public async createDatasets(principal: Principal.User, names: string[]): Promise<{ projectRid: Library.Project.Rid; datasets: Record<string, Dataset.Rid> }> {
        const projectRid = await this.createProject(principal);
        const datasets: Record<string, Dataset.Rid> = {};

        for (const name of names)
            datasets[name] = (await this.catalog.createDataset(principal, { parentRid: projectRid, name, description: null })).rid;

        return { projectRid, datasets };
    }

    /** How many of the dataset's transactions are open — read by the owner, past RLS. */
    public async openTransactions(datasetRid: Dataset.Rid): Promise<number> {
        const { rows } = await sql<{ n: number }>`
            select count(*)::int as n from catalog.transaction where dataset_rid = ${datasetRid} and status = 'open'`.execute(this.owner);

        return rows[0].n;
    }

    public async transactionStatus(rid: Catalog.Transaction.Rid): Promise<string | undefined> {
        const { rows } = await sql<{ status: string }>`select status from catalog.transaction where rid = ${rid}`.execute(this.owner);

        return rows[0]?.status;
    }

    /** The owner's connection, for what a test checks past every policy. */
    public getOwnerDatabase(): Kysely<unknown> {
        return this.owner;
    }
}

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`${name} is not set — tests need test/support/env.ts`);

    return value;
}
