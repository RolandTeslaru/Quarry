import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataConnection } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { DataConnectionHarness } from '../support/data-connection-fixtures';

/** Sources: the definitions on offer, creating one (validated), reading it back, opening its page. */
describe('sources', () => {

    let harness: DataConnectionHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await DataConnectionHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('offers Postgres, with its config and sync forms as JSON Schema', () => {
        const postgres = harness.dataConnection.source.definitions().postgres;

        expect(postgres).toMatchObject({ id: 'postgres', capabilities: { explore: true } });
        expect(JSON.stringify(postgres)).toContain('incrementalColumn');
    });

    describe('creating', () => {

        it('creates a source in the folder, naming its credential', async () => {
            const { source, credential, projectRid } = await harness.createSource(user);

            expect(source).toMatchObject({
                type:            'source',
                parentRid:       projectRid,
                definitionId:    'postgres',
                config:          {},
                credentialRid:   credential.rid,
                outputFolderRid: null,
            });
        });

        it('refuses an unknown source type: 400', async () => {
            const projectRid = await harness.createProject(user);

            await expect(harness.dataConnection.source.create(user, {
                parentRid: projectRid, name: 'X', description: null, definitionId: 'oracle', config: {}, credentialRid: null, outputFolderRid: null,
            })).rejects.toBeInstanceOf(BadRequestException);
        });

        it('refuses a Postgres source without a credential: 400', async () => {
            const projectRid = await harness.createProject(user);

            await expect(harness.dataConnection.source.create(user, {
                parentRid: projectRid, name: 'X', description: null, definitionId: 'postgres', config: {}, credentialRid: null, outputFolderRid: null,
            })).rejects.toBeInstanceOf(BadRequestException);
        });

        it("stores the config as the definition parsed it — settings it doesn't know are dropped", async () => {
            const projectRid = await harness.createProject(user);
            const credential = await harness.createCredential(user, projectRid);

            await expect(harness.dataConnection.source.create(user, {
                parentRid: projectRid, name: 'X', description: null, definitionId: 'postgres', config: { host: 'elsewhere' }, credentialRid: credential.rid, outputFolderRid: null,
            })).resolves.toMatchObject({ config: {} });
        });

        it('accepts a project or folder as the default output, and refuses anything else: 400', async () => {
            const projectRid = await harness.createProject(user);
            const credential = await harness.createCredential(user, projectRid);
            const folder = await harness.library.createFolder(user, { parentRid: projectRid, name: 'Raw', description: null });
            const request = { parentRid: projectRid, description: null, definitionId: 'postgres', config: {}, credentialRid: credential.rid };

            await expect(harness.dataConnection.source.create(user, { ...request, name: 'Into folder', outputFolderRid: folder.rid }))
                .resolves.toMatchObject({ outputFolderRid: folder.rid });

            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            await expect(harness.dataConnection.source.create(user, { ...request, name: 'Into dataset', outputFolderRid: sync.outputDatasetRid }))
                .rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('reading', () => {

        it('gets the source by RID', async () => {
            const { source } = await harness.createSource(user);

            await expect(harness.dataConnection.source.get(user, source.rid)).resolves.toEqual(source);
            await expect(harness.dataConnection.source.require(user, source.rid)).resolves.toEqual(source);
        });

        it('lists it among the sources the user can see', async () => {
            const { source } = await harness.createSource(user);

            const listed = await harness.dataConnection.source.list(user);

            expect(listed.map((found) => found.rid)).toContain(source.rid);
        });

        it("404s a source that doesn't exist", async () => {
            await expect(harness.dataConnection.source.get(user, DataConnection.Source.createRid())).rejects.toBeInstanceOf(NotFoundException);
        });

        it('treats a trashed source as gone: 404, and absent from the list', async () => {
            const { source } = await harness.createSource(user);

            await harness.library.trash(user, source.rid);

            await expect(harness.dataConnection.source.get(user, source.rid)).rejects.toBeInstanceOf(NotFoundException);
            expect((await harness.dataConnection.source.list(user)).map((found) => found.rid)).not.toContain(source.rid);
        });
    });

    describe('opening its page', () => {

        it('returns the source and records an audit open, in the app it was opened from', async () => {
            const { source } = await harness.createSource(user);

            await expect(harness.dataConnection.source.open(user, source.rid, 'data-connection')).resolves.toEqual(source);

            const opens = (await harness.auditEvents(source.rid)).filter((event) => event.action === 'open');

            expect(opens).toEqual([expect.objectContaining({ user_rid: user.userRid, application_id: 'data-connection' })]);
        });

        it('records nothing for a source that is not there: 404', async () => {
            const rid = DataConnection.Source.createRid();

            await expect(harness.dataConnection.source.open(user, rid, 'data-connection')).rejects.toBeInstanceOf(NotFoundException);
            expect(await harness.auditEvents(rid)).toEqual([]);
        });

        it('is for users only — not a run acting for one: 403', async () => {
            const { source } = await harness.createSource(user);

            await expect(harness.dataConnection.source.open(Principal.onBehalfOf(user.userRid, 'sync:test'), source.rid, 'data-connection'))
                .rejects.toBeInstanceOf(ForbiddenException);
        });
    });
});
