import { ConflictException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CodeWorkspace, Foundations } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { Principal } from '@/auth/principal';
import { db } from '@/db/pool';
import { QueueManager } from '@/infra/queue';
import { CheckDispatcher } from '@/services/CodeWorkspace/checks/check-dispatcher';
import { CodeWorkspaceChecks } from '@/services/CodeWorkspace/checks/code-workspace-checks';
import { CodeWorkspaceRepository } from '@/services/CodeWorkspace/repository/code-workspace.repository';
import { MAIN, QUARRY_CI, commitFiles, createWorkspace, type TestWorkspace } from '../support/code-workspace-fixtures';
import { ForgeHarness } from '../support/forge-fixtures';

import CheckRun = CodeWorkspace.CheckRun;

const FEATURE = Foundations.Branch.parse('feature');

const MANIFEST = {
    transforms: [{
        name:      'sales.datasets.orders.clean',
        inputs:    { raw: '/Sales/raw/orders' },
        outputs:   { out: '/Sales/clean/orders' },
        resources: { cpuCores: 1, memoryGb: 4 },
    }],
};

/**
 * Running check runs (docs/design/code-workspaces/checks.md §3): dispatch claims
 * queued runs, one running per workspace, and enqueues them (code-workspace.run-check,
 * read here from the test Redis — nothing consumes it); the test plays the worker
 * (its reports are the service's calls) and the sweep.
 */
describe('check runs, running', () => {

    let harness: ForgeHarness;
    let checks: CodeWorkspaceChecks;
    let dispatcher: CheckDispatcher;
    let admin: Principal.User;
    let add: MockInstance<QueueManager['add']>;
    const runChecks = new Queue(CodeWorkspace.Queue.RunCheck.Definition.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });

    /** The check runs waiting in the queue, oldest first. */
    async function getSent(): Promise<CheckRun.Rid[]> {
        const jobs = await runChecks.getJobs(['waiting'], 0, -1, true);

        return jobs.map((job) => (job.data as CodeWorkspace.Queue.RunCheck.Job).checkRunRid);
    }

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        checks = harness.get(CodeWorkspaceChecks);
        dispatcher = harness.get(CheckDispatcher);
        admin = await harness.createUser();

        vi.spyOn(dispatcher, 'trigger').mockImplementation(() => undefined);      // the test dispatches, when it means to
        add = vi.spyOn(harness.get(QueueManager), 'add');
    });

    beforeEach(async () => {
        add.mockClear();
        await runChecks.obliterate({ force: true });

        // Every test starts with nothing left to dispatch.
        await sql`update code_workspace.check_run set status = 'canceled', finished_at = now() where status in ('queued', 'running')`.execute(db());
    });

    afterAll(async () => {
        await runChecks.close();
        await harness.stop();
    });

    /** A workspace whose main has quarry-ci.yml, and a queued run of it. */
    async function queuedWorkspace(files: Record<string, string> = { 'quarry-ci.yml': QUARRY_CI }): Promise<TestWorkspace & { run: CheckRun.Schema }> {
        const workspace = await createWorkspace(harness, admin, files);
        const { queued } = await checks.pushed(admin, workspace.rid, workspace.heads);

        return { ...workspace, run: queued[0] };
    }

    async function getRun(rid: CheckRun.Rid): Promise<CheckRun.Schema> {
        const run = await harness.get(CodeWorkspaceRepository).checkRun.get(Principal.SELF('test'), rid);

        if (!run)
            throw new Error(`No check run ${rid}`);

        return run;
    }

    /** Dispatched and taken by the (test's) worker. */
    async function startedRun(): Promise<{ workspace: TestWorkspace; run: CheckRun.Schema }> {
        const workspace = await queuedWorkspace();

        await dispatcher.dispatch();
        await checks.start(workspace.run.rid);

        return { workspace, run: await getRun(workspace.run.rid) };
    }

    describe('dispatch', () => {

        it('enqueues a queued run, claimed with its steps laid out, its RID as job id', async () => {
            const { run } = await queuedWorkspace();

            expect(await dispatcher.dispatch()).toBe(1);
            expect(await getSent()).toEqual([run.rid]);

            const sent = await getRun(run.rid);

            expect(await runChecks.getJob(CodeWorkspace.Queue.RunCheck.getJobId(sent))).toBeDefined();

            expect(sent).toMatchObject({ status: 'running', reportedAt: null });
            expect(sent.startedAt).not.toBeNull();
            expect(sent.steps.map((step) => [step.name, step.status])).toEqual([
                [CheckRun.PARSE_STEP, 'succeeded'],
                ['Tests', 'waiting'],
                ['Publish transforms', 'waiting'],
                [CheckRun.PUBLISH_STEP, 'waiting'],
            ]);
        });

        it('runs one check at a time per workspace, oldest first — the next once it finishes', async () => {
            const workspace = await queuedWorkspace();
            const feature = await commitFiles(harness, workspace.rid, { 'b.py': '' }, FEATURE);
            const { queued } = await checks.pushed(admin, workspace.rid, { [FEATURE]: feature });

            expect(await dispatcher.dispatch()).toBe(1);
            expect(await getSent()).toEqual([workspace.run.rid]);
            expect((await getRun(queued[0].rid)).status).toBe('queued');

            await checks.start(workspace.run.rid);
            await checks.finish(workspace.run.rid, { status: 'failed', failure: { step: 'Tests', message: 'pytest failed' } });

            expect(await dispatcher.dispatch()).toBe(1);
            expect(await getSent()).toEqual([workspace.run.rid, queued[0].rid]);
        });

        it('runs different workspaces at once', async () => {
            const first = await queuedWorkspace();
            const second = await queuedWorkspace();

            expect(await dispatcher.dispatch()).toBe(2);
            expect(await getSent()).toEqual([first.run.rid, second.run.rid]);
        });

        it("gives a run back when it can't be enqueued (Redis down), and stops sending", async () => {
            const first = await queuedWorkspace();
            await queuedWorkspace();

            add.mockRejectedValueOnce(new Error('Connection is closed'));

            expect(await dispatcher.dispatch()).toBe(0);
            expect(add).toHaveBeenCalledTimes(1);                                        // not tried again this pass
            expect(await getRun(first.run.rid)).toMatchObject({ status: 'queued', startedAt: null, steps: [] });

            expect(await dispatcher.dispatch()).toBe(2);
        });

        it.each([
            ['no quarry-ci.yml', { 'README.md': '' }, /No quarry-ci.yml at the repository's root/],
            ['YAML that doesn\'t parse', { 'quarry-ci.yml': 'steps: [unclosed' }, /isn't valid YAML/],
            ['publishing before the last step', { 'quarry-ci.yml': 'steps:\n  - name: P\n    uses: quarry/publish-transforms\n  - name: T\n    run: pytest\n' }, /must be the last step/],
            ['an unknown key', { 'quarry-ci.yml': 'on: push\nsteps:\n  - name: P\n    uses: quarry/publish-transforms\n' }, /invalid/],
        ])('fails a run with %s at Parse, never sending it — and sends the next', async (_, files, message) => {
            const broken = await queuedWorkspace(files);
            const fine = await queuedWorkspace();

            expect(await dispatcher.dispatch()).toBe(1);
            expect(await getSent()).toEqual([fine.run.rid]);

            const failed = await getRun(broken.run.rid);

            expect(failed).toMatchObject({ status: 'failed', failure: { step: CheckRun.PARSE_STEP } });
            expect(failed.failure?.message).toMatch(message);
            expect(failed.steps).toMatchObject([{ name: CheckRun.PARSE_STEP, status: 'failed' }]);
            expect(failed.finishedAt).not.toBeNull();
        });

        it('never sends a superseded run, and a push superseding a running one frees the workspace', async () => {
            const workspace = await queuedWorkspace();

            await dispatcher.dispatch();
            const newer = await commitFiles(harness, workspace.rid, { 'a.py': '' });
            const { queued } = await checks.pushed(admin, workspace.rid, { [MAIN]: newer });

            expect((await getRun(workspace.run.rid)).status).toBe('canceled');
            expect(await dispatcher.dispatch()).toBe(1);
            expect((await getSent()).at(-1)).toBe(queued[0].rid);
        });

        it('refuses a second running run in a workspace (the unique index), as a 409 dispatch skips', async () => {
            const workspace = await queuedWorkspace();
            const feature = await commitFiles(harness, workspace.rid, { 'b.py': '' }, FEATURE);
            const { queued } = await checks.pushed(admin, workspace.rid, { [FEATURE]: feature });
            const repository = harness.get(CodeWorkspaceRepository);

            await repository.checkRun.claim(Principal.SELF('test'), workspace.run.rid, []);

            await expect(repository.checkRun.claim(Principal.SELF('test'), queued[0].rid, [])).rejects.toBeInstanceOf(ConflictException);
        });

        it('coalesces calls arriving while it runs into one more pass', async () => {
            await queuedWorkspace();
            await queuedWorkspace();

            const sent = await Promise.all([dispatcher.dispatch(), dispatcher.dispatch(), dispatcher.dispatch()]);

            expect(await getSent()).toHaveLength(2);
            expect(sent.every((count) => count === 2)).toBe(true);
        });
    });

    describe("the worker's reports", () => {

        it('starts a dispatched run once: its steps and a token', async () => {
            const workspace = await queuedWorkspace();

            await dispatcher.dispatch();

            const started = await checks.start(workspace.run.rid);

            expect(started.steps.map((step) => step.name)).toEqual(['Tests', 'Publish transforms']);
            expect(started.token.split('.')).toHaveLength(3);                            // a JWT
            expect(started.checkRun.reportedAt).not.toBeNull();

            await expect(checks.start(workspace.run.rid)).rejects.toBeInstanceOf(ConflictException);
        });

        it("refuses to start a run that wasn't dispatched", async () => {
            const { run } = await queuedWorkspace();

            await expect(checks.start(run.rid)).rejects.toBeInstanceOf(ConflictException);
        });

        it('records a step starting and ending, at its place after Parse', async () => {
            const { run } = await startedRun();
            const startedAt = new Date();

            await checks.reportStep(run.rid, 0, { status: 'running', startedAt });
            expect((await getRun(run.rid)).steps[1]).toMatchObject({ name: 'Tests', status: 'running' });

            const ended = await checks.reportStep(run.rid, 0, { status: 'succeeded', exitCode: 0, startedAt, finishedAt: new Date(), log: '3 passed' });

            expect(ended.steps[1]).toMatchObject({ name: 'Tests', status: 'succeeded', exitCode: 0, log: '3 passed' });
            expect(ended.steps[2]).toMatchObject({ status: 'waiting' });
            expect(ended.reportedAt!.getTime()).toBeGreaterThanOrEqual(run.reportedAt!.getTime());
        });

        it('keeps only the end of a long log', async () => {
            const { run } = await startedRun();
            const log = `${'x'.repeat(CheckRun.Step.LOG_TAIL_BYTES)}THE END`;

            const ended = await checks.reportStep(run.rid, 0, { status: 'failed', exitCode: 1, startedAt: new Date(), finishedAt: new Date(), log });

            expect(ended.steps[1].log).toHaveLength(CheckRun.Step.LOG_TAIL_BYTES);
            expect(ended.steps[1].log.endsWith('THE END')).toBe(true);
        });

        it.each([-1, 2, 7])("refuses step %i — quarry-ci.yml's are 0 and 1", async (index) => {
            const { run } = await startedRun();

            await expect(checks.reportStep(run.rid, index, { status: 'running', startedAt: new Date() })).rejects.toThrow(/no step/);
        });

        it('succeeds with a valid manifest; publishing is skipped (not built yet)', async () => {
            const { run } = await startedRun();

            const finished = await checks.finish(run.rid, { status: 'succeeded', manifest: MANIFEST });

            expect(finished).toMatchObject({ status: 'succeeded', published: false, failure: null });
            expect(finished.finishedAt).not.toBeNull();
            expect(finished.steps.at(-1)).toMatchObject({ name: CheckRun.PUBLISH_STEP, status: 'skipped' });
            expect(finished.steps.at(-1)!.log).toMatch(/1 transform/);
        });

        it.each([
            ['no manifest', null],
            ['no transforms', { transforms: [] }],
            ['two transforms writing one output', { transforms: [MANIFEST.transforms[0], { ...MANIFEST.transforms[0], name: 'sales.datasets.b.b' }] }],
        ])('fails at its publish step with %s', async (_, manifest) => {
            const { run } = await startedRun();

            const finished = await checks.finish(run.rid, { status: 'succeeded', manifest });

            expect(finished).toMatchObject({ status: 'failed', failure: { step: CheckRun.PUBLISH_STEP } });
            expect(finished.steps.at(-1)).toMatchObject({ status: 'failed' });
        });

        it("records a failure, skipping the steps that didn't run", async () => {
            const { run } = await startedRun();

            await checks.reportStep(run.rid, 0, { status: 'failed', exitCode: 1, startedAt: new Date(), finishedAt: new Date(), log: '1 failed' });
            const finished = await checks.finish(run.rid, { status: 'failed', failure: { step: 'Tests', message: 'Exited with 1' } });

            expect(finished).toMatchObject({ status: 'failed', failure: { step: 'Tests', message: 'Exited with 1' } });
            expect(finished.steps.map((step) => step.status)).toEqual(['succeeded', 'failed', 'skipped', 'skipped']);
        });

        it('refuses a second finish', async () => {
            const { run } = await startedRun();

            await checks.finish(run.rid, { status: 'succeeded', manifest: MANIFEST });

            await expect(checks.finish(run.rid, { status: 'failed', failure: { step: 'Tests', message: 'late' } })).rejects.toBeInstanceOf(ConflictException);
            expect((await getRun(run.rid)).status).toBe('succeeded');
        });

        it('refuses the reports of a run a newer push canceled — the worker stops on them', async () => {
            const { workspace, run } = await startedRun();
            const newer = await commitFiles(harness, workspace.rid, { 'a.py': '' });

            await checks.pushed(admin, workspace.rid, { [MAIN]: newer });

            await expect(checks.reportStep(run.rid, 0, { status: 'running', startedAt: new Date() })).rejects.toThrow(/canceled/);
            await expect(checks.finish(run.rid, { status: 'succeeded', manifest: MANIFEST })).rejects.toThrow(/canceled/);
            expect((await getRun(run.rid)).status).toBe('canceled');
        });
    });

    describe('the sweep', () => {

        async function backdate(rid: CheckRun.Rid, column: 'started_at' | 'reported_at', minutes: number): Promise<void> {
            await sql`update code_workspace.check_run set ${sql.ref(column)} = now() - make_interval(mins => ${minutes}) where rid = ${rid}`.execute(db());
        }

        it('sends again a run no worker took within 2 minutes, whose message Redis lost', async () => {
            const { run } = await queuedWorkspace();

            await dispatcher.dispatch();
            await backdate(run.rid, 'started_at', 3);

            const claimed = await getRun(run.rid);

            await runChecks.remove(CodeWorkspace.Queue.RunCheck.getJobId(claimed));                // a Redis restart
            expect(await getSent()).toEqual([]);

            expect(await checks.sweep()).toEqual({ resent: 1, failed: 0, dispatched: 0 });
            expect(await getSent()).toEqual([run.rid]);
            expect(await runChecks.getJob(CodeWorkspace.Queue.RunCheck.getJobId(claimed))).toBeDefined();
            expect((await getRun(run.rid)).status).toBe('running');
        });

        it("doesn't duplicate a message still waiting for a worker (all of them busy)", async () => {
            const { run } = await queuedWorkspace();

            await dispatcher.dispatch();
            await backdate(run.rid, 'started_at', 3);

            expect(await checks.sweep()).toMatchObject({ resent: 1 });
            expect(await getSent()).toEqual([run.rid]);                                          // the same job id: ignored
        });

        it('leaves a run sent moments ago alone', async () => {
            await queuedWorkspace();
            await dispatcher.dispatch();

            expect(await checks.sweep()).toEqual({ resent: 0, failed: 0, dispatched: 0 });
        });

        it('fails a run whose worker went silent for 35 minutes — and frees its workspace', async () => {
            const { workspace, run } = await startedRun();
            const feature = await commitFiles(harness, workspace.rid, { 'b.py': '' }, FEATURE);
            const { queued } = await checks.pushed(admin, workspace.rid, { [FEATURE]: feature });

            await backdate(run.rid, 'reported_at', 36);

            expect(await checks.sweep()).toEqual({ resent: 0, failed: 1, dispatched: 1 });
            expect(await getRun(run.rid)).toMatchObject({ status: 'failed', failure: { step: 'Worker' } });
            expect((await getSent()).at(-1)).toBe(queued[0].rid);
        });

        it('leaves a run that reported recently alone', async () => {
            const { run } = await startedRun();

            await backdate(run.rid, 'reported_at', 20);

            expect(await checks.sweep()).toMatchObject({ resent: 0, failed: 0 });
            expect((await getRun(run.rid)).status).toBe('running');
        });
    });
});
