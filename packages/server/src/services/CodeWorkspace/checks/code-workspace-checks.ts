import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CodeWorkspace, type Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { SessionTokens } from '@/auth/session-tokens';
import { RealtimeService } from '@/services/Realtime/realtime.service';
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
        private readonly realtime:      RealtimeService,
        @InjectDurableQueue(CodeWorkspace.DurableQueue.RunCheck)
        private readonly runCheckQueue: DurableQueueHandle<typeof CodeWorkspace.Queue.RunCheck.Definition>,
    ) {}

    /**
     * Branches moved by a push (or the template's first commit): a run for each new head —
     * its quarry-ci.yml read now (failed at Parse if it's missing or invalid) — and, if the
     * workspace is free, the next scheduled and relayed.
     */
    public async pushed(principal: Principal.User, rid: CodeWorkspace.Rid, moved: CodeWorkspace.Git.Heads): Promise<QueuedCheckRuns> {
        const runs: NewCheckRun[] = [];

        for (const [branch, commit] of Object.entries(moved) as [Foundations.Branch, CodeWorkspace.Git.Commit][]) {
            const config = await readCheckConfig(this.repositories, { workspaceRid: rid, commit });

            if ('error' in config)
                runs.push({ branch, commit, steps: getParseFailedSteps(config.error), failure: { step: CheckRun.PARSE_STEP, message: config.error } });
            else
                runs.push({ branch, commit, steps: layOutSteps(config.config), failure: null });
        }

        const queued = await this.repository.queueCheckRuns(principal, rid, runs);

        for (const checkRun of queued.canceled)
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(checkRun));

        // The run this push scheduled is announced once, below, as scheduled.
        for (const checkRun of queued.queued)
            if (checkRun.rid !== queued.scheduled?.rid)
                this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(checkRun));

        if (queued.scheduled) {
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(queued.scheduled));
            await this.runCheckQueue.relay();
        }

        this.log.info(`Queued ${queued.queued.length} check run(s) of ${rid}`, {
            queued:    queued.queued.map(run => run.rid),
            canceled:  queued.canceled.map(run => run.rid),
            scheduled: queued.scheduled?.rid ?? null,
        });

        return queued;
    }

    /** A page of the workspace's check runs, newest first. Visibility is the caller's to check (CodeWorkspaceService). */
    public async listCheckRuns(principal: Principal, rid: CodeWorkspace.Rid, query: CodeWorkspace.API.ListCheckRuns.Query): Promise<CodeWorkspace.API.ListCheckRuns.Response> {
        const runs = await this.repository.checkRun.list(principal, rid, { branch: query.branch, before: query.before, limit: query.limit + 1 });
        const page = runs.slice(0, query.limit);

        return { checkRuns: page, nextBefore: runs.length > query.limit ? page.at(-1)!.rid : null };
    }

    public async getCheckRun(principal: Principal, rid: CodeWorkspace.Rid, checkRunRid: CheckRun.Rid): Promise<CheckRun.Schema> {
        const checkRun = await this.repository.checkRun.getInWorkspace(principal, rid, checkRunRid);

        if (!checkRun)
            throw new NotFoundException('Not found');

        return checkRun;
    }

    // ── the worker running one ──────────────────────────────────────────

    /** The worker takes a scheduled run — once: quarry-ci.yml's steps, and a token acting as the pusher. */
    public async start(rid: CheckRun.Rid): Promise<Internal.CheckRun.Start.Response> {
        const checkRun = await this.repository.startCheckRun(WORKER, rid);

        if (!checkRun)
            throw new ConflictException("This check run isn't waiting for a worker");

        this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(checkRun));

        // Read when it was pushed, so it reads again: the commit can't have changed.
        const config = await readCheckConfig(this.repositories, checkRun);

        if (!('error' in config) && checkRun.pushedBy) {
            return {
                checkRun,
                steps: config.config.steps,
                token: await this.sessionTokens.mint(checkRun.pushedBy, 'check'),
            };
        }

        // Can't be run after all: failed at set up, and the workspace's next run scheduled.
        const message = 'error' in config ? config.error : 'No pusher to act as';
        const steps = checkRun.steps.map(step => step.status === 'waiting' ? { ...step, status: 'skipped' as const } : step);
        const finished = await this.repository.finishCheckRun(WORKER, rid, { status: 'failed', steps, failure: { step: 'Set up', message } });

        if (finished)
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(finished.run));

        if (finished?.scheduled) {
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(finished.scheduled));
            await this.runCheckQueue.relay();
        }

        throw new ConflictException(message);
    }

    /** A step starting or ending. 400 for a step the file hasn't got; 409 once the run isn't running. */
    public async reportStep(rid: CheckRun.Rid, index: number, report: Internal.CheckRun.Step.Request): Promise<CheckRun.Schema> {
        const parsed = Internal.CheckRun.Step.Request.parse(report);
        const current = await this.repository.checkRun.get(WORKER, rid);

        if (!current)
            throw new NotFoundException('Not found');

        if (current.status !== 'running')
            throw new ConflictException(current.status === 'canceled' ? 'This check run was canceled' : `This check run is ${current.status}`);

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

        this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(updated));

        return updated;
    }

    /**
     * The worker's outcome. Succeeded: the manifest must parse (Check.Manifest), else the
     * run fails at its publish step. Publishing itself isn't built yet — the step is skipped.
     */
    public async finish(rid: CheckRun.Rid, outcome: Internal.CheckRun.Finish.Request): Promise<CheckRun.Schema> {
        const parsed = Internal.CheckRun.Finish.Request.parse(outcome);
        const current = await this.repository.checkRun.get(WORKER, rid);

        if (!current)
            throw new NotFoundException('Not found');

        if (current.status !== 'running')
            throw new ConflictException(current.status === 'canceled' ? 'This check run was canceled' : `This check run is ${current.status}`);

        // Steps that never ran — after a failure, or never started — are skipped.
        const steps = current.steps.map(step => step.status === 'waiting' || step.status === 'running' ? { ...step, status: 'skipped' as const } : step);
        const publish = steps.length - 1;
        const now = new Date();
        let status = parsed.status;
        let failure = parsed.failure;

        if (status === 'failed') {
            failure ??= { step: 'Unknown', message: 'The worker reported a failure without a reason' };
        }
        else {
            const manifest = CodeWorkspace.Check.Manifest.Schema.safeParse(parsed.manifest);

            if (manifest.success) {
                steps[publish] = {
                    ...steps[publish],
                    status:     'skipped',
                    startedAt:  now,
                    finishedAt: now,
                    log:        `${manifest.data.transforms.length} transform(s) found. Publishing job specs isn't built yet.`,
                };
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

        this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(finished.run));

        if (finished.scheduled) {
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(finished.scheduled));
            await this.runCheckQueue.relay();
        }

        this.log.info(`${rid} ${status}`, { workspace: finished.run.workspaceRid, failure, scheduled: finished.scheduled?.rid ?? null });

        return finished.run;
    }

    // ── the sweep ───────────────────────────────────────────────────────

    /** The system worker's minute: fails what went silent, scheduling each workspace's next. (Lost messages are the durable-queue sweep's.) */
    public async sweep(): Promise<Internal.CheckRun.Sweep.Response> {
        const { failed, scheduled } = await this.repository.failSilentCheckRuns(SWEEP, SILENT_MINUTES, {
            step:    'Worker',
            message: `The worker stopped reporting for ${SILENT_MINUTES} minutes`,
        });

        for (const checkRun of failed)
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(checkRun));

        for (const checkRun of scheduled)
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(checkRun));

        if (scheduled.length > 0)
            await this.runCheckQueue.relay();

        if (failed.length > 0)
            this.log.info(`Swept: ${failed.length} failed`, { failed: failed.map(run => run.rid), scheduled: scheduled.map(run => run.rid) });

        return { failed: failed.length, scheduled: scheduled.length };
    }
}
