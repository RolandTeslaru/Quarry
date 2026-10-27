import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CodeWorkspace, type Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { SessionTokens } from '@/auth/session-tokens';
import { CodeWorkspaceRepository } from '../repository/code-workspace.repository';
import type { QueuedCheckRuns } from '../repository/check-run.repository';
import { GitRepositories } from '../git/repositories';
import { CheckDispatcher } from './check-dispatcher';
import { getLogTail, readCheckConfig } from './check-config';

import CheckRun = CodeWorkspace.CheckRun;
import Internal = CodeWorkspace.API.Internal;

const WORKER = Principal.SELF('code-workspace.check-worker');
const SWEEP = Principal.SELF('code-workspace.check-sweep');

/** Sent, and no worker took it within this long: sent again (a no-op if the message is still waiting). */
const UNTAKEN_MINUTES = 2;

/** Taken, then silent this long (the longest step is 30 min): the worker died. */
const SILENT_MINUTES = 35;

/**
 * CI for Code Workspaces (docs/design/code-workspaces/checks.md): a check run
 * per pushed branch head, queued as the pusher; dispatched to the workers' queue
 * (CheckDispatcher); the worker that takes it reports its steps and outcome here;
 * swept every minute.
 * Publishing job specs is not built yet: a passing run ends with its publish step skipped.
 */
@Injectable()
export class CodeWorkspaceChecks {

    private readonly log = System.log.withContext('CodeWorkspace.Checks');

    constructor(
        private readonly repository:    CodeWorkspaceRepository,
        private readonly repositories:  GitRepositories,
        private readonly sessionTokens: SessionTokens,
        public readonly dispatcher:     CheckDispatcher,
    ) {}

    /** Branches moved by a push (or the template's first commit): a queued run for each new head. */
    public async pushed(principal: Principal.User, rid: CodeWorkspace.Rid, moved: CodeWorkspace.Git.Heads): Promise<QueuedCheckRuns> {
        const runs = await this.repository.checkRun.queue(principal, rid, moved);

        for (const run of runs.queued)
            this.log.info(`Queued ${run.rid}: ${run.branch} at ${run.commit.slice(0, 7)}`, { workspace: rid });

        if (runs.canceled.length > 0)
            this.log.info(`Superseded ${runs.canceled.length} run(s) of ${rid}`, { canceled: runs.canceled.map(run => run.rid) });

        this.dispatcher.trigger();

        return runs;
    }

    public async listCheckRuns(principal: Principal, rid: CodeWorkspace.Rid, branch?: Foundations.Branch): Promise<CodeWorkspace.CheckRun.Schema[]> {
        return this.repository.checkRun.list(principal, rid, branch);
    }

    // ── the worker running one ──────────────────────────────────────────

    /** The worker takes a dispatched run — once: quarry-ci.yml's steps, and a token acting as the pusher. */
    public async start(rid: CheckRun.Rid): Promise<Internal.CheckRun.Start.Response> {
        const checkRun = await this.repository.checkRun.start(WORKER, rid);

        if (!checkRun)
            throw new ConflictException("This check run isn't waiting for a worker");

        // Parsed at dispatch, so it parses again: the commit can't have changed.
        const result = await readCheckConfig(this.repositories, checkRun);

        if ('error' in result || !checkRun.pushedBy) {
            const message = 'error' in result ? result.error : 'No pusher to act as';

            await this.repository.checkRun.finish(WORKER, rid, { status: 'failed', steps: skipWaiting(checkRun.steps), failure: { step: 'Set up', message } });
            this.dispatcher.trigger();

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

        const finished = await this.repository.checkRun.finish(WORKER, rid, { status, steps, failure: status === 'failed' ? failure : null });

        if (!finished)
            throw new ConflictException('This check run was canceled');

        this.log.info(`${rid} ${status}`, { workspace: finished.workspaceRid, failure });
        this.dispatcher.trigger();

        return finished;
    }

    // ── the sweep ───────────────────────────────────────────────────────

    /**
     * The system worker's minute: sends again what no worker took (Redis runs without
     * persistence — a restart loses its messages; one still there ignores the resend),
     * fails what went silent, dispatches.
     */
    public async sweep(): Promise<Internal.CheckRun.Sweep.Response> {
        const untaken = await this.repository.checkRun.listUntaken(SWEEP, UNTAKEN_MINUTES);

        for (const run of untaken)
            await this.dispatcher.send(run);

        const failed = await this.repository.checkRun.failSilent(SWEEP, SILENT_MINUTES, {
            step:    'Worker',
            message: `The worker stopped reporting for ${SILENT_MINUTES} minutes`,
        });
        const dispatched = await this.dispatcher.dispatch();

        if (untaken.length + failed.length > 0)
            this.log.info(`Swept: ${untaken.length} sent again, ${failed.length} failed`, { failed: failed.map(run => run.rid) });

        return { resent: untaken.length, failed: failed.length, dispatched };
    }

    /** The run, if it's the worker's to report on: running, and taken. */
    private async getRunning(rid: CheckRun.Rid): Promise<CheckRun.Schema> {
        const checkRun = await this.repository.checkRun.get(WORKER, rid);

        if (!checkRun)
            throw new NotFoundException('Not found');

        if (checkRun.status !== 'running' || !checkRun.reportedAt)
            throw new ConflictException(checkRun.status === 'canceled' ? 'This check run was canceled' : `This check run is ${checkRun.status}`);

        return checkRun;
    }
}

/** Steps that never ran — after a failure, or never started — are skipped. */
function skipWaiting(steps: CheckRun.Step.Schema[]): CheckRun.Step.Schema[] {
    return steps.map(step => step.status === 'waiting' || step.status === 'running' ? { ...step, status: 'skipped' } : step);
}
