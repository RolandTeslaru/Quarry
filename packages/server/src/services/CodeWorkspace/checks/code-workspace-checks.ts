import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CodeWorkspace, type Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { SessionTokens } from '@/auth/session-tokens';
import { DurableQueueHandle, InjectDurableQueue } from '@/infra/durable-queue';
import { CodeWorkspaceRepository } from '../repository/code-workspace.repository';
import type { NewCheckRun, QueuedCheckRuns } from '../repository/check-run.repository';
import { GitRepositories } from '../git/repositories';
import { getLogTail, getParseFailedSteps, layOutSteps, readCheckConfig } from './check-config';

import CheckRun = CodeWorkspace.CheckRun;
import Internal = CodeWorkspace.API.Internal;

const WORKER = Principal.SELF('code-workspace.check-worker');
const SWEEP = Principal.SELF('code-workspace.check-sweep');

/** Taken, then silent this long (the longest step is 30 min): the worker died. */
const SILENT_MINUTES = 35;

/**
 * CI for Code Workspaces (docs/design/code-workspaces/checks.md): a check run per
 * pushed branch head, as the pusher, one at a time per workspace — scheduled in the
 * transaction that frees its workspace, delivered to a worker through a durable
 * queue; the worker reports its steps and outcome here. Publishing job specs is
 * not built yet: a passing run ends with its publish step skipped.
 */
@Injectable()
export class CodeWorkspaceChecks {

    private readonly log = System.log.withContext('CodeWorkspace.Checks');

    constructor(
        private readonly repository:    CodeWorkspaceRepository,
        private readonly repositories:  GitRepositories,
        private readonly sessionTokens: SessionTokens,
        @InjectDurableQueue(CodeWorkspace.DurableQueue.RunCheck)
        private readonly runCheckQueue: DurableQueueHandle<typeof CodeWorkspace.Queue.RunCheck.Definition>,
    ) {}

    /**
     * Branches moved by a push (or the template's first commit): a run for each new head —
     * its quarry-ci.yml read now (failed at Parse if it's missing or invalid) — and, if the
     * workspace is free, the next scheduled and relayed.
     */
    public async pushed(principal: Principal.User, rid: CodeWorkspace.Rid, moved: CodeWorkspace.Git.Heads): Promise<QueuedCheckRuns> {
        const runs = await Promise.all(Object.entries(moved).map(([branch, commit]) => this._prepare(rid, branch as Foundations.Branch, commit)));
        const queued = await this.repository.queueCheckRuns(principal, rid, runs);

        for (const run of queued.queued)
            this.log.info(`Queued ${run.rid}: ${run.branch} at ${run.commit.slice(0, 7)} (${run.status})`, { workspace: rid });

        if (queued.canceled.length > 0)
            this.log.info(`Superseded ${queued.canceled.length} run(s) of ${rid}`, { canceled: queued.canceled.map(run => run.rid) });

        await this._relay(queued.scheduled ? [queued.scheduled] : []);

        return queued;
    }

    public async listCheckRuns(principal: Principal, rid: CodeWorkspace.Rid, branch?: Foundations.Branch): Promise<CodeWorkspace.CheckRun.Schema[]> {
        return this.repository.checkRun.list(principal, rid, branch);
    }

    // ── the worker running one ──────────────────────────────────────────

    /** The worker takes a scheduled run — once: quarry-ci.yml's steps, and a token acting as the pusher. */
    public async start(rid: CheckRun.Rid): Promise<Internal.CheckRun.Start.Response> {
        const checkRun = await this.repository.startCheckRun(WORKER, rid);

        if (!checkRun)
            throw new ConflictException("This check run isn't waiting for a worker");

        // Parsed when it was pushed, so it parses again: the commit can't have changed.
        const result = await readCheckConfig(this.repositories, checkRun);

        if ('error' in result || !checkRun.pushedBy) {
            const message = 'error' in result ? result.error : 'No pusher to act as';

            const finished = await this.repository.finishCheckRun(WORKER, rid, { status: 'failed', steps: skipWaiting(checkRun.steps), failure: { step: 'Set up', message } });

            await this._relay(finished?.scheduled ? [finished.scheduled] : []);

            throw new ConflictException(message);
        }

        return {
            checkRun,
            steps: result.config.steps,
            token: await this.sessionTokens.mint(checkRun.pushedBy, 'check'),
        };
    }

    /** A step starting or ending. 400 for a step the file hasn't got; 409 once the run isn't the worker's. */
    public async reportStep(rid: CheckRun.Rid, index: number, report: Internal.CheckRun.Step.Request): Promise<CheckRun.Schema> {
        const parsed = Internal.CheckRun.Step.Request.parse(report);
        const current = await this.getRunning(rid);
        const position = CheckRun.getStepPosition(index);

        if (!Number.isInteger(index) || index < 0 || position >= current.steps.length - 1)
            throw new BadRequestException(`quarry-ci.yml has no step ${index}`);

        const updated = await this.repository.checkRun.reportStep(WORKER, rid, position, {
            ...current.steps[position],
            status:     parsed.status,
            exitCode:   parsed.exitCode,
            startedAt:  parsed.startedAt,
            finishedAt: parsed.finishedAt,
            log:        getLogTail(parsed.log),
        });

        if (!updated)
            throw new ConflictException('This check run was canceled');

        return updated;
    }

    /**
     * The worker's outcome. Succeeded: the manifest must parse (Check.Manifest), else the
     * run fails at its publish step. Publishing itself isn't built yet — the step is skipped.
     */
    public async finish(rid: CheckRun.Rid, outcome: Internal.CheckRun.Finish.Request): Promise<CheckRun.Schema> {
        const parsed = Internal.CheckRun.Finish.Request.parse(outcome);
        const current = await this.getRunning(rid);
        const steps = skipWaiting(current.steps);
        const publish = steps.length - 1;
        let status = parsed.status;
        let failure = parsed.failure;

        if (status === 'failed') {
            failure ??= { step: 'Unknown', message: 'The worker reported a failure without a reason' };
        }
        else {
            const manifest = CodeWorkspace.Check.Manifest.Schema.safeParse(parsed.manifest);
            const now = new Date();

            if (manifest.success) {
                steps[publish] = { ...steps[publish], status: 'skipped', startedAt: now, finishedAt: now,
                    log: `${manifest.data.transforms.length} transform(s) found. Publishing job specs isn't built yet.` };
            }
            else {
                status = 'failed';
                failure = { step: CheckRun.PUBLISH_STEP, message: `The manifest is invalid: ${manifest.error.issues.map(issue => issue.message).join('; ')}` };
                steps[publish] = { ...steps[publish], status: 'failed', startedAt: now, finishedAt: now, log: failure.message };
            }
        }

        const finished = await this.repository.finishCheckRun(WORKER, rid, { status, steps, failure: status === 'failed' ? failure : null });

        if (!finished)
            throw new ConflictException('This check run was canceled');

        this.log.info(`${rid} ${status}`, { workspace: finished.run.workspaceRid, failure });
        await this._relay(finished.scheduled ? [finished.scheduled] : []);

        return finished.run;
    }

    // ── the sweep ───────────────────────────────────────────────────────

    /** The system worker's minute: fails what went silent, scheduling each workspace's next. (Lost messages are the durable-queue sweep's.) */
    public async sweep(): Promise<Internal.CheckRun.Sweep.Response> {
        const { failed, scheduled } = await this.repository.failSilentCheckRuns(SWEEP, SILENT_MINUTES, {
            step:    'Worker',
            message: `The worker stopped reporting for ${SILENT_MINUTES} minutes`,
        });

        if (failed.length > 0)
            this.log.info(`Swept: ${failed.length} failed`, { failed: failed.map(run => run.rid) });

        await this._relay(scheduled);

        return { failed: failed.length, scheduled: scheduled.length };
    }

    /** A pushed head's run: its steps laid out from quarry-ci.yml at that commit — or why it can't run. */
    private async _prepare(rid: CodeWorkspace.Rid, branch: Foundations.Branch, commit: CodeWorkspace.Git.Commit): Promise<NewCheckRun> {
        const result = await readCheckConfig(this.repositories, { workspaceRid: rid, commit });

        return 'error' in result
            ? { branch, commit, steps: getParseFailedSteps(result.error), failure: { step: CheckRun.PARSE_STEP, message: result.error } }
            : { branch, commit, steps: layOutSteps(result.config), failure: null };
    }

    /** After a commit that scheduled runs: their messages to Redis now. Best effort — the durable-queue sweep catches the rest. */
    private async _relay(scheduled: CheckRun.Schema[]): Promise<void> {
        for (const run of scheduled)
            this.log.info(`Scheduled ${run.rid}: ${run.branch} at ${run.commit.slice(0, 7)}`, { workspace: run.workspaceRid });

        if (scheduled.length > 0)
            await this.runCheckQueue.relay();
    }

    /** The run, if it's the worker's to report on: running. */
    private async getRunning(rid: CheckRun.Rid): Promise<CheckRun.Schema> {
        const checkRun = await this.repository.checkRun.get(WORKER, rid);

        if (!checkRun)
            throw new NotFoundException('Not found');

        if (checkRun.status !== 'running')
            throw new ConflictException(checkRun.status === 'canceled' ? 'This check run was canceled' : `This check run is ${checkRun.status}`);

        return checkRun;
    }
}

/** Steps that never ran — after a failure, or never started — are skipped. */
function skipWaiting(steps: CheckRun.Step.Schema[]): CheckRun.Step.Schema[] {
    return steps.map(step => step.status === 'waiting' || step.status === 'running' ? { ...step, status: 'skipped' } : step);
}
