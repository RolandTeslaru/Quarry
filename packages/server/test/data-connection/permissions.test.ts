import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataConnection, type Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { DataConnectionHarness } from '../support/data-connection-fixtures';

/**
 * Who may do what with sources, syncs and runs — row-level security and
 * Gatekeeper, as members who aren't admins. An admin sets up a project with a
 * source (and its credential) and a sync; members get a role on the project
 * (inherited by everything in it), or none.
 *
 *   discoverer (1) see the source and its syncs
 *   viewer     (2) also read it: run history, test, explore, preview
 *   editor     (3) also create sources and syncs, run them
 *   no grant       see nothing: 404, never 403 — and the same 404 as a source that doesn't exist
 *
 * Probes (test, explore, preview) are gated before anything is asked of the
 * worker, so the refusals need no worker; their successes are in test/e2e.
 */
describe('source, sync and run permissions', () => {

    let harness: DataConnectionHarness;
    let admin: Principal.User;
    let editor: Principal.User;
    let viewer: Principal.User;
    let discoverer: Principal.User;
    let outsider: Principal.User;

    let projectRid: Library.Resource.Rid;
    let source: DataConnection.Source.Schema;
    let sync: DataConnection.Sync.Schema;
    let credentialRid: DataConnection.Source.Schema['credentialRid'];

    const TABLE = { schema: 'public', name: 'tools' };

    beforeAll(async () => {
        harness = await DataConnectionHarness.start();
        admin = await harness.createUser('admin');
        editor = await harness.createUser('member');
        viewer = await harness.createUser('member');
        discoverer = await harness.createUser('member');
        outsider = await harness.createUser('member');

        ({ projectRid, source } = await harness.createSource(admin));
        credentialRid = source.credentialRid;
        sync = await harness.createSync(admin, source);

        await harness.grant(admin, projectRid, editor, 'editor');
        await harness.grant(admin, projectRid, viewer, 'viewer');
        await harness.grant(admin, projectRid, discoverer, 'discoverer');
    });

    afterAll(async () => {
        await harness.stop();
    });

    const members = () => ({ admin, editor, viewer, discoverer });

    /** What a source that doesn't exist gets — what someone without a grant must get too. */
    async function notFoundMessage(fn: () => Promise<unknown>): Promise<string> {
        const error = await fn().then(() => null, (thrown: unknown) => thrown);

        expect(error).toBeInstanceOf(NotFoundException);

        return (error as NotFoundException).message;
    }

    describe('seeing a source (discover)', () => {

        it.each(['admin', 'editor', 'viewer', 'discoverer'] as const)('%s gets it, opens it and finds it in the list', async (who) => {
            const member = members()[who];

            await expect(harness.dataConnection.source.get(member, source.rid)).resolves.toMatchObject({ rid: source.rid });
            await expect(harness.dataConnection.source.open(member, source.rid, 'data-connection')).resolves.toMatchObject({ rid: source.rid });
            expect((await harness.dataConnection.source.list(member)).map((found) => found.rid)).toContain(source.rid);
        });

        it("someone without a grant doesn't: the same 404 as a source that doesn't exist, and absent from the list", async () => {
            const missing = DataConnection.Source.createRid();

            expect(await notFoundMessage(() => harness.dataConnection.source.get(outsider, source.rid)))
                .toBe(await notFoundMessage(() => harness.dataConnection.source.get(outsider, missing)));
            await expect(harness.dataConnection.source.open(outsider, source.rid, 'data-connection')).rejects.toBeInstanceOf(NotFoundException);
            expect((await harness.dataConnection.source.list(outsider)).map((found) => found.rid)).not.toContain(source.rid);
        });

        it("records no audit open for someone who can't see it", async () => {
            await expect(harness.dataConnection.source.open(outsider, source.rid, 'data-connection')).rejects.toThrow();

            const opens = (await harness.auditEvents(source.rid)).filter((event) => event.action === 'open');

            expect(opens.map((event) => event.user_rid)).not.toContain(outsider.userRid);
        });
    });

    describe('probing a source — test, explore, preview (read on the source)', () => {

        const probes = {
            test:    (member: Principal.User) => harness.dataConnection.source.test(member, source.rid),
            explore: (member: Principal.User) => harness.dataConnection.source.explore(member, source.rid),
            preview: (member: Principal.User) => harness.dataConnection.source.previewTable(member, source.rid, TABLE, 10),
        };

        it.each(Object.keys(probes) as (keyof typeof probes)[])('a discoverer may not %s: 403', async (probe) => {
            await expect(probes[probe](discoverer)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it.each(Object.keys(probes) as (keyof typeof probes)[])("someone without a grant may not %s, and doesn't learn it exists: 404", async (probe) => {
            await expect(probes[probe](outsider)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('creating a source (write on the folder, read on the credential)', () => {

        const request = () => ({
            parentRid: projectRid, description: null, definitionId: 'postgres', config: {}, credentialRid, outputFolderRid: null,
        });

        it('an editor may', async () => {
            await expect(harness.dataConnection.source.create(editor, { ...request(), name: 'By editor' })).resolves.toMatchObject({ parentRid: projectRid });
        });

        it.each(['viewer', 'discoverer'] as const)('a %s may not: 403', async (who) => {
            await expect(harness.dataConnection.source.create(members()[who], { ...request(), name: `By ${who}` }))
                .rejects.toBeInstanceOf(ForbiddenException);
        });

        it('someone without a grant may not, and learns nothing: 404', async () => {
            await expect(harness.dataConnection.source.create(outsider, { ...request(), name: 'By outsider' }))
                .rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('syncs', () => {

        const newSync = (member: Principal.User, name: string) => harness.dataConnection.sync.create(member, source.rid, {
            name, config: { kind: 'table', table: 'tools' }, schedule: null, output: { parentRid: projectRid, name },
        });

        it.each(['admin', 'editor', 'viewer', 'discoverer'] as const)('%s lists them', async (who) => {
            expect((await harness.dataConnection.sync.list(members()[who], source.rid)).map((found) => found.rid)).toContain(sync.rid);
        });

        it("someone without a grant can't: 404", async () => {
            await expect(harness.dataConnection.sync.list(outsider, source.rid)).rejects.toBeInstanceOf(NotFoundException);
        });

        it('an editor may create one (write on the source and the output folder)', async () => {
            await expect(newSync(editor, 'Editor sync')).resolves.toMatchObject({ sourceRid: source.rid, createdBy: editor.userRid });
        });

        it.each(['viewer', 'discoverer'] as const)('a %s may not create one: 403, and no dataset is created', async (who) => {
            const before = await harness.library.children(admin, projectRid);

            await expect(newSync(members()[who], `${who} sync`)).rejects.toBeInstanceOf(ForbiddenException);
            expect(await harness.library.children(admin, projectRid)).toEqual(before);
        });

        it('someone without a grant may not create one: 404', async () => {
            await expect(newSync(outsider, 'Outsider sync')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('running a sync now (write on the source and the output dataset)', () => {

        it('an editor may', async () => {
            await expect(harness.dataConnection.sync.run(editor, source.rid, sync.rid)).resolves.toBeUndefined();
        });

        it.each(['viewer', 'discoverer'] as const)('a %s may not: 403', async (who) => {
            await expect(harness.dataConnection.sync.run(members()[who], source.rid, sync.rid)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('someone without a grant may not: 404', async () => {
            await expect(harness.dataConnection.sync.run(outsider, source.rid, sync.rid)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('run history (read on the source)', () => {

        it.each(['admin', 'editor', 'viewer'] as const)('%s sees it', async (who) => {
            await expect(harness.dataConnection.run.list(members()[who], source.rid, sync.rid)).resolves.toBeInstanceOf(Array);
        });

        it('a discoverer may not: 403 — not a silently empty history', async () => {
            await expect(harness.dataConnection.run.list(discoverer, source.rid, sync.rid)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('someone without a grant may not: 404', async () => {
            await expect(harness.dataConnection.run.list(outsider, source.rid, sync.rid)).rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
