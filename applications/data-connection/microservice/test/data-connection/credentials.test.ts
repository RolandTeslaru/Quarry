import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DataConnection, Forge, Keychain, type Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { DataConnectionHarness, type PostgresLogin } from '../support/data-connection-fixtures';

/**
 * The credential boundary: a source's credential goes only to someone who may use it
 * (read on the credential), and its values only to a running job. They never appear
 * in anything a user gets.
 */
describe('source credentials', () => {

    let harness: DataConnectionHarness;
    let admin: Principal.User;
    let editor: Principal.User;
    let viewer: Principal.User;
    let discoverer: Principal.User;
    let outsider: Principal.User;

    let projectRid: Library.Resource.Rid;
    let credential: Keychain.Credential;
    let source: DataConnection.Source;

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
            const encrypted = await harness.sources.credentialOf(who(), source);

            expect(encrypted).toMatchObject({ rid: credential.rid, templateId: 'postgres' });
            expect(JSON.stringify(encrypted)).not.toContain(LOGIN.password);
        });

        it('a discoverer may not use it: 403', async () => {
            await expect(harness.sources.credentialOf(discoverer, source)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("someone without a grant may not, and doesn't learn it exists: 404", async () => {
            await expect(harness.sources.credentialOf(outsider, source)).rejects.toBeInstanceOf(NotFoundException);
        });

        it("a source can't be created with a credential its creator can't read: 404, nothing created", async () => {
            const hidden = await harness.createCredential(admin, await harness.createProject(admin));
            const before = await harness.library.children(admin, projectRid);

            await expect(harness.sources.create(editor, {
                parentRid: projectRid, name: 'Borrowed login', description: null, definitionId: 'postgres', config: {},
                credentialRid: hidden.rid, outputFolderRid: null,
            })).rejects.toBeInstanceOf(NotFoundException);

            expect(await harness.library.children(admin, projectRid)).toEqual(before);
        });
    });

    describe('a running job', () => {

        it("gets the credential's values, and its source", async () => {
            const sync = await harness.createSync(admin, source);
            const job = await harness.runningJob(editor, sync);

            const connection = await harness.dataConnection.getJobConnection({ ...editor, via: 'forge-job' }, job.rid);

            expect(connection.source.rid).toBe(source.rid);
            expect(connection.credential).toMatchObject({ host: LOGIN.host, password: LOGIN.password });
        });

        it("refuses a person's own session, whatever they may read", async () => {
            const sync = await harness.createSync(admin, source);
            const job = await harness.runningJob(admin, sync);

            await expect(harness.dataConnection.getJobConnection(admin, job.rid)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("refuses a job started by someone who can't read the credential", async () => {
            // The credential lives where the editor has no grant; the source and its sync where they're an editor.
            const elsewhere = await harness.createProject(admin);
            const hidden = await harness.createCredential(admin, elsewhere, LOGIN);
            const hiddenSource = await harness.sources.create(admin, {
                parentRid: projectRid, name: 'Hidden login', description: null, definitionId: 'postgres', config: {}, credentialRid: hidden.rid, outputFolderRid: null,
            });
            const sync = await harness.createSync(admin, hiddenSource);
            const job = await harness.runningJob(editor, sync);

            await expect(harness.dataConnection.getJobConnection({ ...editor, via: 'forge-job' }, job.rid)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('nothing a user gets contains its values or its blob', () => {

        it('not sources, syncs or the credential itself', async () => {
            await harness.createSync(admin, source);

            const responses = [
                await harness.sources.get(viewer, source.rid),
                await harness.sources.open(viewer, source.rid, 'data-connection'),
                await harness.sources.list(viewer),
                await harness.syncs.list(viewer, source.rid),
                // Keychain's own API — the main server's — as the viewer.
                await Keychain.API.Credential.get(await harness.getApi(viewer), credential.rid),
                await Keychain.API.Credential.list(await harness.getApi(viewer)),
            ];

            for (const response of responses) {
                const json = JSON.stringify(response);

                expect(json).not.toContain(LOGIN.password);
                expect(json).not.toContain(LOGIN.host);
            }
        });
    });
});
