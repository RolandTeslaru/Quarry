import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Catalog, Forge, Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { ForgeHarness, MAIN } from '../support/forge-fixtures';

/**
 * Who may do what with builds and recipes — row-level security and
 * Gatekeeper, as members who aren't admins. An admin sets up a project; members
 * get a role on it (inherited by its datasets), or none.
 *
 *   discoverer (1) see builds of its datasets
 *   viewer     (2) see them, read their recipes
 *   editor     (3) start and cancel builds, publish recipes
 *   no grant       see nothing: 404, never 403 (a hidden build isn't revealed)
 */
describe('build and recipe permissions', () => {

    let harness: ForgeHarness;
    let admin: Principal.User;
    let editor: Principal.User;
    let viewer: Principal.User;
    let discoverer: Principal.User;
    let outsider: Principal.User;

    let projectRid: Library.Resource.Rid;
    let datasets: Record<string, Catalog.Dataset.Rid>;
    let recipe: Forge.Recipe.Schema;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        admin = await harness.createUser('admin');
        editor = await harness.createUser('member');
        viewer = await harness.createUser('member');
        discoverer = await harness.createUser('member');
        outsider = await harness.createUser('member');

        ({ projectRid, datasets } = await harness.createDatasets(admin, ['raw', 'out', 'out2'], ['raw']));
        ({ A: recipe } = await harness.publish(admin, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]));

        await harness.grant(admin, projectRid, editor, 'editor');
        await harness.grant(admin, projectRid, viewer, 'viewer');
        await harness.grant(admin, projectRid, discoverer, 'discoverer');
    });

    afterAll(async () => {
        await harness.stop();
    });

    describe('starting a build (write on every output, read on every input)', () => {

        it('an editor may', async () => {
            const { build } = await harness.build(editor, [datasets.out]);

            expect(build.createdBy).toBe(editor.userRid);
            await harness.forge.cancelBuild(editor, build.rid);
        });

        it('a viewer may not: 403', async () => {
            await expect(harness.build(viewer, [datasets.out])).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('a discoverer may not: 403', async () => {
            await expect(harness.build(discoverer, [datasets.out])).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("someone who can't see the dataset gets 404, not 403", async () => {
            await expect(harness.build(outsider, [datasets.out])).rejects.toBeInstanceOf(NotFoundException);
        });

        it('a refused build opens nothing — the outputs stay free', async () => {
            await expect(harness.build(viewer, [datasets.out])).rejects.toThrow();

            const { build } = await harness.build(editor, [datasets.out]);

            await harness.forge.cancelBuild(editor, build.rid);
        });
    });

    describe('seeing builds (discover on one of their targets)', () => {

        let buildRid: Forge.Build.Rid;
        let jobRid: Forge.Job.Rid;

        beforeAll(async () => {
            const created = await harness.build(admin, [datasets.out]);

            buildRid = created.build.rid;
            jobRid = Object.values(created.jobs)[0].rid;
        });

        afterAll(async () => {
            await harness.forge.cancelBuild(admin, buildRid);
        });

        it.each([
            ['an editor', () => editor],
            ['a viewer', () => viewer],
            ['a discoverer', () => discoverer],
        ])('%s sees the build, its jobs, and finds it in the list', async (_, who) => {
            const found = await harness.forge.getBuild(who(), buildRid);

            expect(found.build.rid).toBe(buildRid);
            expect(Object.keys(found.jobs)).toEqual([jobRid]);
            await expect(harness.forge.getJob(who(), jobRid)).resolves.toMatchObject({ rid: jobRid });

            const listed = await harness.forge.listBuilds(who(), { datasetRid: datasets.out, limit: 50 });

            expect(listed.map((build) => build.rid)).toContain(buildRid);
        });

        it("someone without a grant doesn't: 404 for the build and the job, absent from lists", async () => {
            await expect(harness.forge.getBuild(outsider, buildRid)).rejects.toBeInstanceOf(NotFoundException);
            await expect(harness.forge.getJob(outsider, jobRid)).rejects.toBeInstanceOf(NotFoundException);

            const listed = await harness.forge.listBuilds(outsider, { limit: 200 });

            expect(listed.map((build) => build.rid)).not.toContain(buildRid);
        });
    });

    describe('canceling a build (write on every target)', () => {

        it('a viewer may not — 403, and the build keeps running', async () => {
            const { build } = await harness.build(admin, [datasets.out]);

            await expect(harness.forge.cancelBuild(viewer, build.rid)).rejects.toBeInstanceOf(ForbiddenException);

            const still = await harness.forge.getBuild(admin, build.rid);

            expect(still.build.status).toBe('running');
            await harness.forge.cancelBuild(admin, build.rid);
        });

        it("someone who can't see it gets 404", async () => {
            const { build } = await harness.build(admin, [datasets.out]);

            await expect(harness.forge.cancelBuild(outsider, build.rid)).rejects.toBeInstanceOf(NotFoundException);
            await harness.forge.cancelBuild(admin, build.rid);
        });

        it("an editor may cancel someone else's build", async () => {
            const { build } = await harness.build(admin, [datasets.out]);

            await expect(harness.forge.cancelBuild(editor, build.rid)).resolves.toMatchObject({ build: { status: 'canceled' } });
        });
    });

    describe('recipes', () => {

        it('the current recipe is visible to whoever can discover the dataset and its producer', async () => {
            await expect(harness.forge.recipes.getCurrent(discoverer, datasets.out, [MAIN])).resolves.toMatchObject({ rid: recipe.rid });
            await expect(harness.forge.recipes.getCurrent(outsider, datasets.out, [MAIN])).resolves.toBeNull();
        });

        it('publishing needs write on the producer and the outputs: an editor may', async () => {
            const published = await harness.forge.recipes.publish(editor, projectRid, MAIN, [{
                driver:             recipe.driver,
                inputDatasetRids:  [datasets.raw],
                outputDatasetRids: [datasets.out2],
                compute:           recipe.compute,
            }]);

            expect(published).toHaveLength(1);
        });

        it('a viewer may not publish: 403', async () => {
            await expect(harness.forge.recipes.publish(viewer, projectRid, MAIN, [{
                driver:             recipe.driver,
                inputDatasetRids:  [datasets.raw],
                outputDatasetRids: [datasets.out],
                compute:           recipe.compute,
            }])).rejects.toBeInstanceOf(ForbiddenException);
        });
    });
});
