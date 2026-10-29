import { ConflictException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CodeWorkspace, Foundations } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { Principal } from '@/auth/principal';
import { db } from '@/db/pool';
import { DurableQueues } from '@/infra/durable-queue';
import { QueueManager } from '@/infra/queue';
import { CIService } from '@/services/CodeWorkspace/ci/ci.service';
import { CodeWorkspaceRepository } from '@/services/CodeWorkspace/repository/code-workspace.repository';
import { MAIN, QUARRY_CI, commitFiles, createWorkspace, type TestWorkspace } from '../support/code-workspace-fixtures';
import { ForgeHarness } from '../support/forge-fixtures';

import CI = CodeWorkspace.CI;
import CheckRun = CI.CheckRun;
import StepReport = CI.API.Internal.CheckRun.Step.Request;
import Outcome = CI.API.Internal.CheckRun.Finish.Request;

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
 * Running check runs (docs/design/code-workspaces/checks.md §3): one at a time per
 * workspace — a push schedules its run if the workspace is free, and whatever frees
 * it (a finish, a superseding push, the sweep failing a silent run) schedules the
 * next, adding its message to the durable queue (code-workspace.run-check, read here
 * from the test Redis — nothing consumes it). The test plays the worker (its reports
 * are the service's calls) and the sweep.
 */
describe('check runs, running', () => {

    let harness: ForgeHarness;
    let checks: CIService;
    let admin: Principal.User;
    let add: MockInstance<QueueManager['add']>;
    const runCheckQueue = new Queue(CI.Queue.RunCheck.Definition.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });

    /** The check runs waiting in Redis, oldest first. */
    async function getSent(): Promise<CheckRun.Rid[]> {
        const jobs = await runCheckQueue.getJobs(['waiting'], 0, -1, true);

        return jobs.map((job) => (job.data as CI.Queue.RunCheck.Job).checkRunRid);
    }

    /** The run-check messages in the outbox — scheduled runs no worker has taken yet. */
    async function getOutbox(): Promise<{ jobId: string; sentAt: Date | null }[]> {
        const { rows } = await sql<{ job_id: string; sent_at: Date | null }>`
            select job_id, sent_at from foundations.outbox where queue_name = ${CI.Queue.RunCheck.Definition.name} order by id`.execute(db());

        return rows.map((row) => ({ jobId: row.job_id, sentAt: row.sent_at }));
    }

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        checks = harness.get(CIService);
        admin = await harness.createUser();

        add = vi.spyOn(harness.get(QueueManager), 'add');
    });

    beforeEach(async () => {
        add.mockClear();
        await runCheckQueue.obliterate({ force: true });

        // Every test starts with nothing left to deliver.
        await sql`update code_workspace.check_run set status = 'canceled', finished_at = now() where status in ('waiting', 'scheduled', 'running')`.execute(db());
        await sql`delete from foundations.outbox where queue_name = ${CI.Queue.RunCheck.Definition.name}`.execute(db());
    });

    afterAll(async () => {
        await runCheckQueue.close();
        await harness.stop();
    });

    /** Every run of the workspace (one branch's, or all), newest first — up to a page of 100. */
    function listRuns(principal: Principal, rid: CodeWorkspace.Rid, branch?: Foundations.Branch): Promise<CI.CheckRun.Schema[]> {
        return harness.get(CIService).listCheckRuns(principal, rid, { branch, limit: 100 }).then((page) => page.checkRuns);
    }

    /** A workspace whose main has quarry-ci.yml, and its run — scheduled at once: the workspace is free. */
    async function scheduledWorkspace(files: Record<string, string> = { 'quarry-ci.yml': QUARRY_CI }): Promise<TestWorkspace & { run: CheckRun.Schema }> {
        const workspace = await createWorkspace(harness, admin, files);
        const { queued } = await checks.queueChecksForMovedHeads(admin, workspace.rid, workspace.heads);

        return { ...workspace, run: queued[0] };
    }

    /** A commit on another branch, pushed: its run (waiting, if the workspace is busy). */
    async function pushBranch(workspace: TestWorkspace, branch: Foundations.Branch): Promise<CheckRun.Schema> {
        const commit = await commitFiles(harness, workspace.rid, { [`${branch}.py`]: '' }, branch);
        const { queued } = await checks.queueChecksForMovedHeads(admin, workspace.rid, { [branch]: commit });

        return getRun(queued[0].rid);
    }

    async function getRun(rid: CheckRun.Rid): Promise<CheckRun.Schema> {
        const run = await harness.get(CodeWorkspaceRepository).checkRun.get(Principal.SELF('test'), rid);

        if (!run)
            throw new Error(`No check run ${rid}`);

        return run;
    }

    /** Scheduled and taken by the (test's) worker. */
    async function startedRun(): Promise<{ workspace: TestWorkspace; run: CheckRun.Schema }> {
        const workspace = await scheduledWorkspace();

        await checks.start(workspace.run.rid);

        return { workspace, run: await getRun(workspace.run.rid) };
    }

    describe('scheduling', () => {

        it('schedules a push in a free workspace at once: steps laid out, its message added and sent (its RID as job id)', async () => {
            const { run } = await scheduledWorkspace();

            const scheduled = await getRun(run.rid);

            expect(scheduled).toMatchObject({ status: 'scheduled', startedAt: null });
            expect(scheduled.scheduledAt).not.toBeNull();
            expect(scheduled.steps.map((step) => [step.name, step.status])).toEqual([
                [CheckRun.PARSE_STEP, 'succeeded'],
                ['Tests', 'waiting'],
                ['Publish transforms', 'waiting'],
                [CheckRun.PUBLISH_STEP, 'waiting'],
            ]);
            expect(await getSent()).toEqual([run.rid]);
            expect(await getOutbox()).toMatchObject([{ jobId: run.rid }]);
            expect((await getOutbox())[0].sentAt).not.toBeNull();
        });

        it('runs one check at a time per workspace — the next scheduled by the finish that frees it', async () => {
            const workspace = await scheduledWorkspace();
            const waiting = await pushBranch(workspace, FEATURE);

            expect(waiting.status).toBe('waiting');
            expect(await getSent()).toEqual([workspace.run.rid]);

            await checks.start(workspace.run.rid);
            expect((await getRun(waiting.rid)).status).toBe('waiting');                  // running counts too

            await checks.finish(workspace.run.rid, Outcome.parse({ status: 'failed', failure: { step: 'Tests', message: 'pytest failed' } }));

            expect((await getRun(waiting.rid)).status).toBe('scheduled');
            expect(await getSent()).toEqual([workspace.run.rid, waiting.rid]);
        });

        it('runs different workspaces at once', async () => {
            const first = await scheduledWorkspace();
            const second = await scheduledWorkspace();

            expect(await getSent()).toEqual([first.run.rid, second.run.rid]);
        });

        // The outcome under concurrency. (It passes without scheduleNext's advisory lock too: the race needs two
        // transactions inside each other's commit window, which these don't reliably hit — the lock is from Postgres's rules.)
        it('schedules exactly one of many pushes racing for a free workspace — and every push succeeds', async () => {
            const workspace = await createWorkspace(harness, admin, { 'quarry-ci.yml': QUARRY_CI });
            const branches = Array.from({ length: 10 }, (_, index) => Foundations.Branch.parse(`race-${index}`));
            const repository = harness.get(CodeWorkspaceRepository);
            const steps = [{ name: CheckRun.PARSE_STEP, status: 'succeeded' as const, exitCode: null, startedAt: null, finishedAt: null, log: '' }];

            // Straight to the repository, all at once: no Git reads to stagger them.
            await Promise.all(branches.map((branch) =>
                repository.queueCheckRuns(admin, workspace.rid, [{ branch, commit: workspace.heads[MAIN], steps, failure: null }])));

            const statuses = (await listRuns(admin, workspace.rid)).map((run) => run.status);

            expect(statuses.filter((status) => status === 'scheduled')).toHaveLength(1);
            expect(statuses.filter((status) => status === 'waiting')).toHaveLength(9);
            expect(await getOutbox()).toHaveLength(1);
        });

        it("keeps a run scheduled when Redis refuses — its message stays in the outbox, for the sweep", async () => {
            add.mockRejectedValueOnce(new Error('Connection is closed'));

            const { run } = await scheduledWorkspace();

            expect((await getRun(run.rid)).status).toBe('scheduled');
            expect(await getSent()).toEqual([]);
            expect(await getOutbox()).toMatchObject([{ jobId: run.rid, sentAt: null }]);

            await harness.get(DurableQueues).sweep();

            expect(await getSent()).toEqual([run.rid]);
        });

        it.each([
            ['no quarry-ci.yml', { 'README.md': '' }, /No quarry-ci.yml at the repository's root/],
            ['YAML that doesn\'t parse', { 'quarry-ci.yml': 'steps: [unclosed' }, /Flow sequence/],
            ['publishing before the last step', { 'quarry-ci.yml': 'steps:\n  - name: P\n    uses: quarry/publish-transforms\n  - name: T\n    run: pytest\n' }, /must be the last step/],
            ['an unknown key', { 'quarry-ci.yml': 'on: push\nsteps:\n  - name: P\n    uses: quarry/publish-transforms\n' }, /Unrecognized key/],
        ])('fails a push with %s at Parse, never scheduled — the workspace stays free', async (_, files, message) => {
            const broken = await scheduledWorkspace(files);
            const failed = await getRun(broken.run.rid);

            expect(failed).toMatchObject({ status: 'failed', failure: { step: CheckRun.PARSE_STEP }, scheduledAt: null });
            expect(failed.failure?.message).toMatch(message);
            expect(failed.steps).toMatchObject([{ name: CheckRun.PARSE_STEP, status: 'failed' }]);
            expect(failed.finishedAt).not.toBeNull();
            expect(await getSent()).toEqual([]);

            // A fixed commit is scheduled straight away: nothing holds the workspace.
            const fixed = await commitFiles(harness, broken.rid, { 'quarry-ci.yml': QUARRY_CI });
            const { queued } = await checks.queueChecksForMovedHeads(admin, broken.rid, { [MAIN]: fixed });

            expect((await getRun(queued[0].rid)).status).toBe('scheduled');
        });

        it('superseding a scheduled run acks its message and schedules the new head in the same push', async () => {
            const workspace = await scheduledWorkspace();
            const newer = await commitFiles(harness, workspace.rid, { 'a.py': '' });
            const { queued, canceled, scheduled } = await checks.queueChecksForMovedHeads(admin, workspace.rid, { [MAIN]: newer });

            expect(canceled.map((run) => run.rid)).toEqual([workspace.run.rid]);
            expect(scheduled?.rid).toBe(queued[0].rid);
            expect(await getOutbox()).toMatchObject([{ jobId: queued[0].rid }]);
            expect((await getSent()).at(-1)).toBe(queued[0].rid);
        });
    });

    describe("the worker's reports", () => {

        it('starts a scheduled run once — its steps, a token, its message acked', async () => {
            const workspace = await scheduledWorkspace();

            const started = await checks.start(workspace.run.rid);

            expect(started.steps.map((step) => step.name)).toEqual(['Tests', 'Publish transforms']);
            expect(started.token.split('.')).toHaveLength(3);                            // a JWT
            expect(started.checkRun).toMatchObject({ status: 'running' });
            expect(started.checkRun.startedAt).not.toBeNull();
            expect(await getOutbox()).toEqual([]);

            await expect(checks.start(workspace.run.rid)).rejects.toBeInstanceOf(ConflictException);
        });

        it("refuses to start a run that isn't scheduled (waiting for its workspace)", async () => {
            const workspace = await scheduledWorkspace();
            const waiting = await pushBranch(workspace, FEATURE);

            expect(waiting.status).toBe('waiting');
            await expect(checks.start(waiting.rid)).rejects.toBeInstanceOf(ConflictException);
        });

        it('records a step starting and ending, at its place after Parse', async () => {
            const { run } = await startedRun();
            const startedAt = new Date();

            await checks.reportStep(run.rid, 0, StepReport.parse({ status: 'running', startedAt }));
            expect((await getRun(run.rid)).steps[1]).toMatchObject({ name: 'Tests', status: 'running' });

            const ended = await checks.reportStep(run.rid, 0, StepReport.parse({ status: 'succeeded', exitCode: 0, startedAt, finishedAt: new Date(), log: '3 passed' }));

            expect(ended.steps[1]).toMatchObject({ name: 'Tests', status: 'succeeded', exitCode: 0, log: '3 passed' });
            expect(ended.steps[2]).toMatchObject({ status: 'waiting' });
            expect(ended.reportedAt!.getTime()).toBeGreaterThanOrEqual(run.reportedAt!.getTime());
        });

        it('keeps only the end of a long log', async () => {
            const { run } = await startedRun();
            const log = `${'x'.repeat(CheckRun.Step.LOG_TAIL_BYTES)}THE END`;

            const ended = await checks.reportStep(run.rid, 0, StepReport.parse({ status: 'failed', exitCode: 1, startedAt: new Date(), finishedAt: new Date(), log }));

            expect(ended.steps[1].log).toHaveLength(CheckRun.Step.LOG_TAIL_BYTES);
            expect(ended.steps[1].log.endsWith('THE END')).toBe(true);
        });

        it('succeeds with an empty manifest — a pipeline with no transforms publishes no recipes', async () => {
            const { run } = await startedRun();

            const finished = await checks.finish(run.rid, Outcome.parse({ status: 'succeeded', manifest: { transforms: [] } }));

            expect(finished).toMatchObject({ status: 'succeeded', failure: null, published: true });
            expect(finished.steps.at(-1)).toMatchObject({ status: 'succeeded' });
            expect(finished.steps.at(-1)!.log).toMatch(/Published 0 recipe/);
        });

        it("fails at its publish step when the manifest reads a dataset that doesn't exist", async () => {
            const { run } = await startedRun();

            const finished = await checks.finish(run.rid, Outcome.parse({ status: 'succeeded', manifest: MANIFEST }));

            expect(finished).toMatchObject({ status: 'failed', published: false, failure: { step: CheckRun.PUBLISH_STEP } });
            expect(finished.failure!.message).toMatch(/Not found/);
        });

        it.each([
            ['no manifest', null],
            ['two transforms writing one output', { transforms: [MANIFEST.transforms[0], { ...MANIFEST.transforms[0], name: 'sales.datasets.b.b' }] }],
        ])('fails at its publish step with %s', async (_, manifest) => {
            const { run } = await startedRun();

            const finished = await checks.finish(run.rid, Outcome.parse({ status: 'succeeded', manifest }));

            expect(finished).toMatchObject({ status: 'failed', failure: { step: CheckRun.PUBLISH_STEP } });
            expect(finished.steps.at(-1)).toMatchObject({ status: 'failed' });
        });

        it("records a failure, skipping the steps that didn't run", async () => {
            const { run } = await startedRun();

            await checks.reportStep(run.rid, 0, StepReport.parse({ status: 'failed', exitCode: 1, startedAt: new Date(), finishedAt: new Date(), log: '1 failed' }));
            const finished = await checks.finish(run.rid, Outcome.parse({ status: 'failed', failure: { step: 'Tests', message: 'Exited with 1' } }));

            expect(finished).toMatchObject({ status: 'failed', failure: { step: 'Tests', message: 'Exited with 1' } });
            expect(finished.steps.map((step) => step.status)).toEqual(['succeeded', 'failed', 'skipped', 'skipped']);
        });

        it('refuses a second finish', async () => {
            const { run } = await startedRun();

            await checks.finish(run.rid, Outcome.parse({ status: 'succeeded', manifest: { transforms: [] } }));

            await expect(checks.finish(run.rid, Outcome.parse({ status: 'failed', failure: { step: 'Tests', message: 'late' } }))).rejects.toBeInstanceOf(ConflictException);
            expect((await getRun(run.rid)).status).toBe('succeeded');
        });

        it('refuses the reports of a run a newer push canceled — the worker stops on them', async () => {
            const { workspace, run } = await startedRun();
            const newer = await commitFiles(harness, workspace.rid, { 'a.py': '' });

            await checks.queueChecksForMovedHeads(admin, workspace.rid, { [MAIN]: newer });

            await expect(checks.reportStep(run.rid, 0, StepReport.parse({ status: 'running', startedAt: new Date() }))).rejects.toThrow(/isn't running/);
            await expect(checks.finish(run.rid, Outcome.parse({ status: 'succeeded', manifest: MANIFEST }))).rejects.toThrow(/isn't running/);
            expect((await getRun(run.rid)).status).toBe('canceled');
        });
    });

    describe('the sweep', () => {

        it('fails a run whose worker went silent for 35 minutes — and schedules the workspace\'s next', async () => {
            const { workspace, run } = await startedRun();
            const waiting = await pushBranch(workspace, FEATURE);

            await sql`update code_workspace.check_run set reported_at = now() - interval '36 minutes' where rid = ${run.rid}`.execute(db());

            expect(await checks.sweep()).toEqual({ failed: 1, scheduled: 1 });
            expect(await getRun(run.rid)).toMatchObject({ status: 'failed', failure: { step: 'Worker' } });
            expect((await getRun(waiting.rid)).status).toBe('scheduled');
            expect((await getSent()).at(-1)).toBe(waiting.rid);
        });

        it('leaves a run that reported recently alone', async () => {
            const { run } = await startedRun();

            await sql`update code_workspace.check_run set reported_at = now() - interval '20 minutes' where rid = ${run.rid}`.execute(db());

            expect(await checks.sweep()).toEqual({ failed: 0, scheduled: 0 });
            expect((await getRun(run.rid)).status).toBe('running');
        });

        it("leaves a scheduled run alone, however long it waits for a worker — delivering it is the durable queue's", async () => {
            const { run } = await scheduledWorkspace();

            await sql`update code_workspace.check_run set scheduled_at = now() - interval '2 hours' where rid = ${run.rid}`.execute(db());

            expect(await checks.sweep()).toEqual({ failed: 0, scheduled: 0 });
            expect((await getRun(run.rid)).status).toBe('scheduled');
        });
    });
});
