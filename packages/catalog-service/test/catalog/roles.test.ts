import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Dataset, type Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-server/auth/principal';
import { db } from '@quarry/platform-server/db/pool';
import { CatalogHarness } from '../support/catalog-fixtures';

/**
 * What the Catalog service's database login may and mayn't do (catalog/001_initial.sql,
 * docs/design/architecture-split.md §5) — checked against Postgres itself, on the service's login.
 */
describe("the Catalog service's database roles", () => {

    let harness: CatalogHarness;
    let user: Principal.User;
    let projectRid: Library.Project.Rid;

    beforeAll(async () => {
        harness = await CatalogHarness.start();
        user = await harness.createUser();
        projectRid = await harness.createProject(user);
    });

    afterAll(async () => {
        await harness.stop();
    });

    /** A transaction as `catalog_user` for the user — what the service's user requests run as. */
    const asCatalogUser = <R>(fn: (trx: Transaction<unknown>) => Promise<R>): Promise<R> =>
        db().transaction().execute(async (trx) => {
            await sql`select set_config('app.user_rid', ${user.userRid}, true)`.execute(trx);
            await sql`set local role catalog_user`.execute(trx);

            return fn(trx);
        });

    const insertResource = (database: Kysely<unknown> | Transaction<unknown>, type: string, rid: string) => sql`
        insert into library.resource (rid, type, name, parent_rid, created_by)
        values (${rid}, ${type}, ${`Test ${randomUUID()}`}, ${projectRid}, ${user.userRid})`.execute(database);

    describe('as a user (catalog_user)', () => {

        it('creates datasets and folders in the Library', async () => {
            const { rid } = await harness.catalog.createDataset(user, { parentRid: projectRid, name: 'orders', description: null });
            const folder = await harness.library.createFolder(user, { parentRid: projectRid, name: 'raw', description: null });

            expect(rid).toMatch(/\.dataset\./);
            expect(folder.rid).toMatch(/\.folder\./);
        });

        it("can't create another product's resource", async () => {
            const rid = `ri.code-workspace.main.workspace.${randomUUID()}`;

            await expect(asCatalogUser((trx) => insertResource(trx, 'workspace', rid)))
                .rejects.toThrow(/row-level security policy "catalog_creates"/);
        });

        it("can't change a folder or a project — the Library's, in the main server", async () => {
            const folder = await harness.library.createFolder(user, { parentRid: projectRid, name: 'staging', description: null });

            const renamed = await asCatalogUser((trx) => sql`
                update library.resource set name = 'renamed' where rid in (${folder.rid}, ${projectRid})`.execute(trx));

            expect(renamed.numAffectedRows).toBe(0n);
        });

        it('trashes its own datasets', async () => {
            const { rid } = await harness.catalog.createDataset(user, { parentRid: projectRid, name: 'scratch', description: null });

            await harness.library.trash(user, rid);

            const { rows } = await sql<{ trashed: boolean }>`
                select trashed_at is not null as trashed from library.resource where rid = ${rid}`.execute(harness.getOwnerDatabase());

            expect(rows[0].trashed).toBe(true);
        });

        it("can't write the platform's tables, nor read another product's", async () => {
            await expect(asCatalogUser((trx) => sql`update identity."user" set display_name = 'x' where rid = ${user.userRid}`.execute(trx)))
                .rejects.toThrow(/permission denied for table user/);
            await expect(asCatalogUser((trx) => sql`insert into audit.access_event (user_rid, resource_rid, resource_type, action) values (${user.userRid}, ${projectRid}, 'project', 'read')`.execute(trx)))
                .rejects.toThrow(/permission denied for schema audit/);
            await expect(asCatalogUser((trx) => sql`select 1 from keychain.credential`.execute(trx)))
                .rejects.toThrow(/permission denied for schema keychain/);
        });
    });

    describe('as itself (catalog_service)', () => {

        it("reads the platform's tables and its own, and nothing else", async () => {
            await expect(sql`select count(*) from library.resource`.execute(db())).resolves.toBeDefined();
            await expect(sql`select count(*) from catalog.dataset`.execute(db())).resolves.toBeDefined();
            await expect(sql`select 1 from keychain.credential`.execute(db())).rejects.toThrow(/permission denied for schema keychain/);
            await expect(sql`select 1 from forge.job`.execute(db())).rejects.toThrow(/permission denied for schema forge/);
        });

        it("can't write the Library", async () => {
            await expect(insertResource(db(), 'dataset', Dataset.createRid())).rejects.toThrow(/row-level security policy/);
        });
    });
});
