import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { DataConnectionHarness } from '../support/data-connection-fixtures';

/**
 * Syncs: creating one, with its output dataset and its Forge recipe, and listing them.
 */
describe('syncs', () => {

    let harness: DataConnectionHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await DataConnectionHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    describe('creating', () => {

        it('creates the sync and its output dataset, in the folder asked for', async () => {
            const { source, projectRid } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            const dataset = await harness.catalog.get(user, { rid: sync.outputDatasetRid });

            expect(sync).toMatchObject({ sourceRid: source.rid, schedule: null, enabled: true, createdBy: user.userRid });
            expect(dataset).toMatchObject({ parentRid: projectRid, lastSequence: 0 });
        });

        it("publishes a recipe: no inputs, its dataset as the output, the source as producer", async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            expect(await harness.getCurrentRecipe(user, sync.outputDatasetRid)).toMatchObject({
                producerRid:        source.rid,
                runtimeConfig:      { type: 'data-connection', sourceRid: source.rid, syncRid: sync.rid, syncConfig: sync.config },
                inputDatasetRids:   [],
                outputTransactions: { [sync.outputDatasetRid]: { type: 'append', incrementalColumn: 'updated_at' } },
            });
        });

        it('publishes a snapshot for a sync with no incremental column', async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source, { snapshot: true });

            expect((await harness.getCurrentRecipe(user, sync.outputDatasetRid))?.outputTransactions).toEqual({ [sync.outputDatasetRid]: { type: 'snapshot' } });
        });

        it("keeps the source's other syncs published when another is created", async () => {
            const { source } = await harness.createSource(user);
            const first = await harness.createSync(user, source);
            const second = await harness.createSync(user, source);

            expect((await harness.getCurrentRecipe(user, first.outputDatasetRid))?.runtimeConfig).toMatchObject({ syncRid: first.rid });
            expect((await harness.getCurrentRecipe(user, second.outputDatasetRid))?.runtimeConfig).toMatchObject({ syncRid: second.rid });
        });

        it("stores the config as the integration's schema parsed it (defaults filled in)", async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            expect(sync.config).toEqual({ kind: 'table', schema: 'public', table: 'tools', incrementalColumn: 'updated_at' });
        });

        it("refuses a config the integration doesn't accept: 400, and creates no dataset", async () => {
            const { source, projectRid } = await harness.createSource(user);
            const before = await harness.library.children(user, projectRid);

            await expect(harness.syncs.create(user, source.rid, {
                name:     'Bad',
                config:   { kind: 'table' },                         // no table
                schedule: null,
                output:   { parentRid: projectRid, name: 'Never' },
            })).rejects.toBeInstanceOf(BadRequestException);

            expect(await harness.library.children(user, projectRid)).toEqual(before);
        });

        it('refuses a second sync into an existing name — the dataset name is taken: 409', async () => {
            const { source, projectRid } = await harness.createSource(user);
            const request = { name: 'Twice', config: { kind: 'table', table: 'tools' }, schedule: null, output: { parentRid: projectRid, name: 'Same name' } };

            await harness.syncs.create(user, source.rid, request);

            await expect(harness.syncs.create(user, source.rid, request)).rejects.toBeInstanceOf(ConflictException);
        });
    });

    describe('listing', () => {

        it("lists a source's syncs by name — and only that source's", async () => {
            const { source } = await harness.createSource(user);
            const { source: other } = await harness.createSource(user);
            const a = await harness.createSync(user, source);
            const b = await harness.createSync(user, source);

            await harness.createSync(user, other);

            const listed = await harness.syncs.list(user, source.rid);

            expect(listed.map((sync) => sync.rid).sort()).toEqual([a.rid, b.rid].sort());
            expect(listed.map((sync) => sync.name)).toEqual([...listed.map((sync) => sync.name)].sort());
        });
    });
});
