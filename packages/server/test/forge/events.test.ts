import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Forge } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * Live updates: every change to a job is published on its build's channel as
 * `forge:job:updated`, with the job as it is now — what the RealtimeGateway
 * relays to browsers. Listened to on Redis, as the gateway does.
 */
describe('job events', () => {

    let harness: ForgeHarness;
    let user: Principal.User;
    let listener: Redis;
    const received: Forge.Event[] = [];

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();

        listener = new Redis(process.env.REDIS_URL ?? '');
        await listener.psubscribe('forge:build:*');
        listener.on('pmessage', (_pattern, _channel, message) => received.push(Forge.Event.Schema.parse(JSON.parse(message))));
    });

    afterAll(async () => {
        await listener.quit();
        await harness.stop();
    });

    /** The build's events so far, as `<recipe>:<status>`, once at least `count` have arrived. */
    async function eventsOf(buildRid: Forge.Build.Rid, names: Record<string, string>, count: number): Promise<string[]> {
        const deadline = Date.now() + 5_000;

        const mine = () => received
            .filter((event) => event.channel === Forge.Event.getChannel(buildRid))
            .map((event) => `${names[event.job.recipeRid]}:${event.job.status}`);

        while (mine().length < count && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 20));

        return mine();
    }

    it('announces each step of a two-job build, in order', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'],   outputs: ['b'] },
        ]);
        const names = { [recipes.A.rid]: 'A', [recipes.B.rid]: 'B' };

        const { build } = await harness.build(user, [datasets.a, datasets.b]);
        let { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);
        await harness.run(jobs.A);
        ({ jobs } = await harness.jobsByRecipe(user, build.rid, recipes));
        await harness.run(jobs.B);

        const events = await eventsOf(build.rid, names, 7);

        // Initializing announces every job (in no particular order); delivery to Redis isn't a job change.
        expect(new Set(events.slice(0, 2))).toEqual(new Set(['A:scheduled', 'B:waiting']));
        expect(events.slice(2)).toEqual([
            'A:running', 'A:succeeded', 'B:scheduled', 'B:running', 'B:succeeded',
        ]);
    });

    it('announces the canceled jobs when a job fails', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['raw'], outputs: ['b'] },
            { name: 'C', inputs: ['a'],   outputs: ['c'] },
        ]);
        const names = { [recipes.A.rid]: 'A', [recipes.B.rid]: 'B', [recipes.C.rid]: 'C' };

        const { build } = await harness.build(user, [datasets.a, datasets.b, datasets.c]);
        const { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);
        await harness.run(jobs.A, 'failed');

        const events = await eventsOf(build.rid, names, 7);

        expect(events).toContain('A:failed');
        expect(events).toContain('B:canceled');
        expect(events).toContain('C:canceled');
        expect(events.indexOf('A:failed')).toBeLessThan(events.indexOf('C:canceled'));
    });

    it('announces the jobs a user cancels', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
        const names = { [recipes.A.rid]: 'A' };

        const { build } = await harness.build(user, [datasets.a]);

        await harness.forge.cancelBuild(user, build.rid);

        expect(await eventsOf(build.rid, names, 2)).toEqual(['A:scheduled', 'A:canceled']);
    });

    it("publishes each build on its own channel — another build's subscriber hears nothing", async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

        const { build } = await harness.build(user, [datasets.a]);
        await harness.forge.cancelBuild(user, build.rid);
        await eventsOf(build.rid, {}, 2);

        const channels = new Set(received.map((event) => event.channel));

        expect(received.every((event) => event.channel === Forge.Event.getChannel(event.job.buildRid))).toBe(true);
        expect(channels.size).toBeGreaterThan(1);
    });
});
