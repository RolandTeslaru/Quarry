import { ForbiddenException, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CodeWorkspace, Foundations } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { CIService } from '@/services/CodeWorkspace/ci/ci.service';
import { CodeWorkspaceService } from '@/services/CodeWorkspace/code-workspace.service';
import { MAIN, QUARRY_CI, commitFiles, createWorkspace } from '../support/code-workspace-fixtures';
import { ForgeHarness } from '../support/forge-fixtures';

import CI = CodeWorkspace.CI;
import CheckRun = CI.CheckRun;
import StepReport = CI.API.Internal.CheckRun.Step.Request;
import Outcome = CI.API.Internal.CheckRun.Finish.Request;

const MANIFEST = { transforms: [] };

/**
 * The Checks tab's data (docs/design/code-workspaces/checks.md §7): a workspace's
 * check runs a page at a time, newest first, for whoever can read it — and every
 * change to a run on the workspace's channel, heard on Redis as the gateway hears it.
 */
describe('check run history', () => {

    let harness: ForgeHarness;
    let service: CodeWorkspaceService;
    let checks: CIService;
    let admin: Principal.User;
    let listener: Redis;
    const received: CodeWorkspace.Event[] = [];

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        service = harness.get(CodeWorkspaceService);
        checks = harness.get(CIService);
        admin = await harness.createUser();

        listener = new Redis(process.env.REDIS_URL ?? '');
        await listener.psubscribe('code-workspace:workspace:*');
        listener.on('pmessage', (_pattern, _channel, message) => received.push(CodeWorkspace.Event.Schema.parse(JSON.parse(message))));
    });

    afterAll(async () => {
        await listener.quit();
        await harness.stop();
    });

    /** A workspace with `count` pushes to main, oldest first — each superseding the last. */
    async function pushedWorkspace(count: number) {
        const workspace = await createWorkspace(harness, admin, { 'quarry-ci.yml': QUARRY_CI });
        const runs: CheckRun.Schema[] = [];

        for (let index = 0; index < count; index++) {
            const commit = await commitFiles(harness, workspace.rid, { [`${index}.py`]: '' });

            runs.push((await checks.queueChecksForMovedHeads(admin, workspace.rid, { [MAIN]: commit })).queued[0]);
        }

        return { ...workspace, runs };
    }

    /** The workspace's events so far, as `<run's commit, short>:<status>`, once at least `count` have arrived. */
    async function eventsOf(rid: CodeWorkspace.Rid, count: number): Promise<string[]> {
        const deadline = Date.now() + 5_000;

        const mine = () => received
            .filter((event) => event.channel === CodeWorkspace.Event.getChannel(rid))
            .map((event) => `${event.checkRun.commit.slice(0, 7)}:${event.checkRun.status}`);

        while (mine().length < count && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 20));

        return mine();
    }

    describe('paging', () => {

        it('lists runs newest first, a page at a time, until nextBefore is null', async () => {
            const { rid, runs } = await pushedWorkspace(5);
            const newestFirst = runs.map((run) => run.rid).reverse();

            const first = await service.ci.listCheckRuns(admin, rid, { limit: 2 });
            const second = await service.ci.listCheckRuns(admin, rid, { limit: 2, before: first.nextBefore! });
            const third = await service.ci.listCheckRuns(admin, rid, { limit: 2, before: second.nextBefore! });

            expect(first.checkRuns.map((run) => run.rid)).toEqual(newestFirst.slice(0, 2));
            expect(second.checkRuns.map((run) => run.rid)).toEqual(newestFirst.slice(2, 4));
            expect(third.checkRuns.map((run) => run.rid)).toEqual(newestFirst.slice(4));
            expect(third.nextBefore).toBeNull();
        });

        it("keeps its pages when new runs arrive meanwhile (keyset, not offset)", async () => {
            const { rid, runs } = await pushedWorkspace(3);
            const first = await service.ci.listCheckRuns(admin, rid, { limit: 1 });

            await commitFiles(harness, rid, { 'new.py': '' }).then((commit) => checks.queueChecksForMovedHeads(admin, rid, { [MAIN]: commit }));

            const second = await service.ci.listCheckRuns(admin, rid, { limit: 1, before: first.nextBefore! });

            expect(second.checkRuns.map((run) => run.rid)).toEqual([runs[1].rid]);
        });

        it('filters by branch', async () => {
            const { rid } = await pushedWorkspace(1);
            const feature = Foundations.Branch.parse('feature');
            const commit = await commitFiles(harness, rid, { 'f.py': '' }, feature);

            await checks.queueChecksForMovedHeads(admin, rid, { [feature]: commit });

            expect((await service.ci.listCheckRuns(admin, rid, { branch: feature, limit: 25 })).checkRuns.map((run) => run.commit)).toEqual([commit]);
        });

        it('gets one run — only through its own workspace', async () => {
            const { rid, runs } = await pushedWorkspace(1);
            const other = await pushedWorkspace(1);

            expect((await service.ci.getCheckRun(admin, rid, runs[0].rid)).rid).toBe(runs[0].rid);
            await expect(service.ci.getCheckRun(admin, other.rid, runs[0].rid)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('who may see them', () => {

        it('lets a reader page and get runs; refuses a discoverer (403) and hides them from an outsider (404)', async () => {
            const { rid, projectRid, runs } = await pushedWorkspace(1);
            const viewer = await harness.createUser('member');
            const discoverer = await harness.createUser('member');
            const outsider = await harness.createUser('member');

            await harness.grant(admin, projectRid, viewer, 'viewer');
            await harness.grant(admin, projectRid, discoverer, 'discoverer');

            expect((await service.ci.listCheckRuns(viewer, rid, { limit: 25 })).checkRuns).toHaveLength(1);
            expect((await service.ci.getCheckRun(viewer, rid, runs[0].rid)).rid).toBe(runs[0].rid);
            await expect(service.ci.listCheckRuns(discoverer, rid, { limit: 25 })).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.ci.listCheckRuns(outsider, rid, { limit: 25 })).rejects.toBeInstanceOf(NotFoundException);
            await expect(service.ci.getCheckRun(outsider, rid, runs[0].rid)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('a trashed workspace', () => {

        it('hides its runs: 404, even for its owner', async () => {
            const { rid, runs } = await pushedWorkspace(1);

            await harness.library.trash(admin, rid);

            await expect(service.ci.listCheckRuns(admin, rid, { limit: 25 })).rejects.toBeInstanceOf(NotFoundException);
            await expect(service.ci.getCheckRun(admin, rid, runs[0].rid)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('events', () => {

        it("announces a run's whole life on its workspace's channel, in order", async () => {
            const workspace = await createWorkspace(harness, admin, { 'quarry-ci.yml': QUARRY_CI });
            const { queued } = await checks.queueChecksForMovedHeads(admin, workspace.rid, workspace.heads);
            const run = queued[0];
            const short = run.commit.slice(0, 7);

            await checks.start(run.rid);
            await checks.reportStep(run.rid, 0, StepReport.parse({ status: 'running', startedAt: new Date() }));
            await checks.reportStep(run.rid, 0, StepReport.parse({ status: 'succeeded', exitCode: 0, startedAt: new Date(), finishedAt: new Date() }));
            await checks.finish(run.rid, Outcome.parse({ status: 'succeeded', manifest: MANIFEST }));

            // Pushed into a free workspace: queued and scheduled in one commit — one event, as it is after it.
            expect(await eventsOf(workspace.rid, 5)).toEqual([
                `${short}:scheduled`, `${short}:running`, `${short}:running`, `${short}:running`, `${short}:succeeded`,
            ]);

            const steps = received.filter((event) => event.checkRun.rid === run.rid).map((event) => event.checkRun.steps[1].status);

            expect(steps).toEqual(['waiting', 'waiting', 'running', 'succeeded', 'succeeded']);
        });

        it('announces a superseded run canceled, and the new one', async () => {
            const { rid, runs } = await pushedWorkspace(1);
            const newer = await commitFiles(harness, rid, { 'b.py': '' });

            await checks.queueChecksForMovedHeads(admin, rid, { [MAIN]: newer });

            expect(await eventsOf(rid, 3)).toEqual([
                `${runs[0].commit.slice(0, 7)}:scheduled`, `${runs[0].commit.slice(0, 7)}:canceled`, `${newer.slice(0, 7)}:scheduled`,
            ]);
        });

        it("announces a waiting run, then its scheduling when the run before it finishes", async () => {
            const workspace = await createWorkspace(harness, admin, { 'quarry-ci.yml': QUARRY_CI });
            const first = (await checks.queueChecksForMovedHeads(admin, workspace.rid, workspace.heads)).queued[0];
            const feature = Foundations.Branch.parse('feature');
            const commit = await commitFiles(harness, workspace.rid, { 'f.py': '' }, feature);

            await checks.queueChecksForMovedHeads(admin, workspace.rid, { [feature]: commit });
            await checks.start(first.rid);
            await checks.finish(first.rid, Outcome.parse({ status: 'failed', failure: { step: 'Tests', message: 'x' } }));

            const events = await eventsOf(workspace.rid, 5);

            expect(events.filter((event) => event.startsWith(commit.slice(0, 7)))).toEqual([`${commit.slice(0, 7)}:waiting`, `${commit.slice(0, 7)}:scheduled`]);
            expect(events.indexOf(`${first.commit.slice(0, 7)}:failed`)).toBeLessThan(events.indexOf(`${commit.slice(0, 7)}:scheduled`));
        });
    });
});
