import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataConnection } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { DataConnectionHarness, type PostgresLogin } from '../support/data-connection-fixtures';
import { createExternalDatabase, dropExternalDatabase } from '../support/external-database';

/**
 * End to end: probing a source — test, explore, preview — decrypts its credential and
 * opens it with DuckDB, here in the service. The "external" system is a throwaway
 * database on the dev Postgres, made and dropped by this file.
 */
describe('probing a source', () => {

    let harness: DataConnectionHarness;
    let user: Principal.User;

    const external = `quarry_test_source_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    let login: PostgresLogin;

    beforeAll(async () => {
        login = await createExternalDatabase(external);

        harness = await DataConnectionHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness?.stop();
        await dropExternalDatabase(external);
    });

    describe('a source that logs in', () => {

        let source: DataConnection.Source;

        beforeAll(async () => {
            ({ source } = await harness.createSource(user, login));
        });

        it('passes the connection test', async () => {
            await expect(harness.sources.test(user, source.rid)).resolves.toEqual({ ok: true, error: null });
        });

        it('lists its tables, across schemas', async () => {
            const { tables } = await harness.sources.explore(user, source.rid);

            // Postgres's own catalogs (pg_catalog, information_schema) are listed too — reported, not asserted.
            expect(tables).toEqual(expect.arrayContaining([
                { schema: 'inventory', name: 'parts' },
                { schema: 'public', name: 'tools' },
            ]));
        });

        it("previews a table's first rows, with its columns typed as datasets type them", async () => {
            const preview = await harness.sources.previewTable(user, source.rid, { schema: 'public', name: 'tools' }, 2);

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

        it("a table that isn't there is the source's error, passed on: 424", async () => {
            const preview = harness.sources.previewTable(user, source.rid, { schema: 'public', name: 'missing' }, 2);

            await expect(preview).rejects.toMatchObject({ status: 424 });
        });
    });

    describe('a source that can\'t log in', () => {

        it('a wrong password fails the test, with the database\'s reason — and no password in it', async () => {
            const { source } = await harness.createSource(user, { ...login, password: 'wrong-password' });

            const tested = await harness.sources.test(user, source.rid);

            expect(tested.ok).toBe(false);
            expect(tested.error).toMatch(/password authentication failed/);
            expect(tested.error).not.toContain('wrong-password');
        });

        it('a wrong password makes explore fail cleanly: 424 with the reason', async () => {
            const { source } = await harness.createSource(user, { ...login, password: 'wrong-password' });

            await expect(harness.sources.explore(user, source.rid)).rejects.toMatchObject({
                status:  424,
                message: expect.stringMatching(/password authentication failed/),
            });
        });

        it("an unreachable host fails the test, saying it couldn't connect", async () => {
            const { source } = await harness.createSource(user, { ...login, host: '127.0.0.1', port: 1 });

            const tested = await harness.sources.test(user, source.rid);

            expect(tested.ok).toBe(false);
            expect(tested.error).toMatch(/connect|refused/i);
        });
    });
});

// ── the "external" database ─────────────────────────────────────────────

/** A database with two tables in two schemas, and the login to reach it — the dev Postgres's own. */
