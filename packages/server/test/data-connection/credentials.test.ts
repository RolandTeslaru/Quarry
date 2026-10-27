import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataConnection, Keychain, Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { DataConnectionHarness, type PostgresLogin } from '../support/data-connection-fixtures';

/**
 * The credential boundary: the server hands a source's credential only to
 * someone who may use it (read on the credential), and only encrypted — for the
 * Data Connection worker to decrypt. Its values never appear in anything a user gets.
 */
describe('source credentials', () => {

    let harness: DataConnectionHarness;
    let admin: Principal.User;
    let editor: Principal.User;
    let viewer: Principal.User;
    let discoverer: Principal.User;
    let outsider: Principal.User;

    let projectRid: Library.Resource.Rid;
    let credential: Keychain.Credential.Schema;
    let source: DataConnection.Source.Schema;

    const LOGIN: PostgresLogin = { host: 'db.internal', port: 5432, database: 'tools', user: 'reader', password: 'hunter2-never-in-a-response' };

    beforeAll(async () => {
        harness = await DataConnectionHarness.start();
        admin = await harness.createUser('admin');
        editor = await harness.createUser('member');
        viewer = await harness.createUser('member');
        discoverer = await harness.createUser('member');
        outsider = await harness.createUser('member');

        ({ projectRid, credential, source } = await harness.createSource(admin, LOGIN));

        await harness.grant(admin, projectRid, editor, 'editor');
        await harness.grant(admin, projectRid, viewer, 'viewer');
        await harness.grant(admin, projectRid, discoverer, 'discoverer');
    });

    afterAll(async () => {
        await harness.stop();
    });

    describe('who gets it', () => {

        it.each([['an editor', () => editor], ['a viewer', () => viewer]])('%s, who may read it, gets it encrypted', async (_, who) => {
            const encrypted = await harness.dataConnection.source.credentialOf(who(), source);

            expect(encrypted).toMatchObject({ rid: credential.rid, templateId: 'postgres' });
            expect(JSON.stringify(encrypted)).not.toContain(LOGIN.password);
        });

        it('a discoverer may not use it: 403', async () => {
            await expect(harness.dataConnection.source.credentialOf(discoverer, source)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("someone without a grant may not, and doesn't learn it exists: 404", async () => {
            await expect(harness.dataConnection.source.credentialOf(outsider, source)).rejects.toBeInstanceOf(NotFoundException);
        });

        it("a source can't be created with a credential its creator can't read: 404, nothing created", async () => {
            const hidden = await harness.createCredential(admin, await harness.createProject(admin));
            const before = await harness.library.children(admin, projectRid);

            await expect(harness.dataConnection.source.create(editor, {
                parentRid: projectRid, name: 'Borrowed login', description: null, definitionId: 'postgres', config: {},
                credentialRid: hidden.rid, outputFolderRid: null,
            })).rejects.toBeInstanceOf(NotFoundException);

            expect(await harness.library.children(admin, projectRid)).toEqual(before);
        });
    });

    describe('a run', () => {

        it('hands the worker the credential encrypted, never its values', async () => {
            const sync = await harness.createSync(admin, source);
            const started = await harness.startRun(sync, editor);

            expect(started.credential).toMatchObject({ rid: credential.rid, templateId: 'postgres' });
            expect(started.credential?.blob).toBeTruthy();
            expect(JSON.stringify(started)).not.toContain(LOGIN.password);
        });

        it("acting for someone who can't read the credential: refused, the run recorded failed, no transaction left open", async () => {
            // The credential lives where the editor has no grant; the source and its sync where they're an editor.
            const elsewhere = await harness.createProject(admin);
            const hidden = await harness.createCredential(admin, elsewhere, LOGIN);
            const hiddenSource = await harness.dataConnection.source.create(admin, {
                parentRid: projectRid, name: 'Hidden login', description: null, definitionId: 'postgres', config: {}, credentialRid: hidden.rid, outputFolderRid: null,
            });
            const sync = await harness.createSync(admin, hiddenSource);

            await expect(harness.startRun(sync, editor)).rejects.toBeInstanceOf(NotFoundException);

            const [run] = await harness.runs(admin, sync);

            expect(run).toMatchObject({ status: 'failed', triggeredBy: editor.userRid, transactionRid: null });
            expect(await harness.openTransactions(sync.outputDatasetRid)).toBe(0);
        });
    });

    describe('nothing a user gets contains its values or its blob', () => {

        it('not sources, syncs, runs or the credential itself', async () => {
            const sync = await harness.createSync(admin, source);
            const started = await harness.startRun(sync, admin);
            const blob = started.credential?.blob;

            await harness.completeRun(started, [1], 'a');

            const responses = [
                await harness.dataConnection.source.get(viewer, source.rid),
                await harness.dataConnection.source.open(viewer, source.rid, 'data-connection'),
                await harness.dataConnection.source.list(viewer),
                await harness.dataConnection.sync.list(viewer, source.rid),
                await harness.dataConnection.run.list(viewer, source.rid, sync.rid),
                await harness.keychain.get(viewer, credential.rid),
                await harness.keychain.list(viewer),
            ];

            for (const response of responses) {
                const json = JSON.stringify(response);

                expect(json).not.toContain(LOGIN.password);
                expect(json).not.toContain(LOGIN.host);
                expect(blob && json.includes(blob)).toBeFalsy();
            }
        });
    });
});
