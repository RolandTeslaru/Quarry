import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CodeWorkspace, type Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { SessionTokens } from '@/auth/session-tokens';
import { RealtimeService } from '@/services/Realtime/realtime.service';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { DurableQueueHandle, InjectDurableQueue } from '@/infra/durable-queue';
import { CodeWorkspaceRepository } from '../repository/code-workspace.repository';
import type { NewCheckRun, QueuedCheckRuns } from '../repository/check-run.repository';
import { GitRepos } from '../git/git-repos';
import { getErrorMessage, getLogTail, getParseFailedSteps, layOutSteps, readCheckConfig } from './check-config';
import { CheckPublisher } from './check-publisher';

import CI = CodeWorkspace.CI;
import CheckRun = CI.CheckRun;
import Internal = CI.API.Internal;

const WORKER = Principal.SELF('code-workspace.check-worker');
const SWEEP = Principal.SELF('code-workspace.check-sweep');

/** The longest step is 30 minutes: silent longer than this, the worker died. */
const SILENT_MINUTES = 35;

/** A check run per pushed branch head, one at a time per workspace (docs/design/code-workspaces/checks.md). */
@Injectable()
export class CIService {

    private readonly log = System.log.withContext('CodeWorkspace.CI');

    constructor(
        public readonly gatekeeper:     GatekeeperService,
        private readonly repository:    CodeWorkspaceRepository,
        private readonly gitRepos:      GitRepos,
        private readonly sessionTokens: SessionTokens,
        private readonly realtime:      RealtimeService,
        private readonly publisher:     CheckPublisher,
        @InjectDurableQueue(CI.DurableQueue.RunCheck)
        private readonly runCheckQueue: DurableQueueHandle<typeof CI.Queue.RunCheck.Definition>,
    ) {}

    /** Never throws: the push has already succeeded. */
    public async queueChecksForPush(principal: Principal.User, rid: CodeWorkspace.Rid, before: CodeWorkspace.Git.Heads): Promise<void> {
        try {
            const moved = await this.gitRepos.getMovedHeads(rid, before);

            if (Object.keys(moved).length > 0)
                await this.queueChecksForMovedHeads(principal, rid, moved);
        }
        catch (error) {
            this.log.error(`Couldn't queue checks for a push to ${rid}`, { error });
        }
    }

    public async queueChecksForMovedHeads(principal: Principal.User, rid: CodeWorkspace.Rid, moved: CodeWorkspace.Git.Heads): Promise<QueuedCheckRuns> {
        const runs: NewCheckRun[] = [];

        for (const branch of Object.keys(moved) as Foundations.Branch[]) {
            const commit = moved[branch];

            try {
                const config = await readCheckConfig(this.gitRepos, rid, commit);

                runs.push({ branch, commit, steps: layOutSteps(config), failure: null });
            }
            catch (error) {
                const message = getErrorMessage(error);

                runs.push({
                    branch,
                    commit,
                    steps:   getParseFailedSteps(message),
                    failure: { step: CheckRun.PARSE_STEP, message },
                });
            }
        }

        // Also cancels the branches' older runs, and schedules one if the workspace is free.
        const queued = await this.repository.queueCheckRuns(principal, rid, runs);

        for (const checkRun of queued.canceled)
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(checkRun));

        for (const checkRun of queued.queued)
            if (checkRun.rid !== queued.scheduled?.rid)
                this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(checkRun));

        if (queued.scheduled) {
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(queued.scheduled));
            await this.runCheckQueue.relay();
        }

        return queued;
    }

    @SecurityGate('read')
    public async listCheckRuns(principal: Principal, rid: CodeWorkspace.Rid, query: CI.API.ListCheckRuns.Query): Promise<CI.API.ListCheckRuns.Response> {
        // One more than a page: if it comes back, there's a next page.
        const runs = await this.repository.checkRun.list(principal, rid, {
            branch: query.branch,
            before: query.before,
            limit:  query.limit + 1,
        });

        const page = runs.slice(0, query.limit);
        let nextBefore: CheckRun.Rid | null = null;

        if (runs.length > query.limit)
            nextBefore = page[page.length - 1].rid;

        return { checkRuns: page, nextBefore };
    }

    @SecurityGate('read')
    public async getCheckRun(principal: Principal, rid: CodeWorkspace.Rid, checkRunRid: CheckRun.Rid): Promise<CheckRun.Schema> {
        const checkRun = await this.repository.checkRun.getInWorkspace(principal, rid, checkRunRid);

        if (!checkRun)
            throw new NotFoundException('Not found');

        return checkRun;
    }

    public async start(rid: CheckRun.Rid): Promise<Internal.CheckRun.Start.Response> {
        const checkRun = await this.repository.startCheckRun(WORKER, rid);

        if (!checkRun)
            throw new ConflictException("This check run isn't scheduled");

        this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(checkRun));

        const config = await readCheckConfig(this.gitRepos, checkRun.workspaceRid, checkRun.commit);
        const token = await this.sessionTokens.mint(checkRun.pushedBy!, 'check');

        return { checkRun, steps: config.steps, token };
    }

    public async reportStep(rid: CheckRun.Rid, index: number, report: Internal.CheckRun.Step.Request): Promise<CheckRun.Schema> {
        const current = await this.repository.checkRun.get(WORKER, rid);

        if (current?.status !== 'running')
            throw new ConflictException("This check run isn't running");

        const position = CheckRun.getStepPosition(index);

        const updated = await this.repository.checkRun.reportStep(WORKER, rid, position, {
            ...current.steps[position],
            status:     report.status,
            exitCode:   report.exitCode,
            startedAt:  report.startedAt,
            finishedAt: report.finishedAt,
            log:        getLogTail(report.log),
        });

        if (!updated)
            throw new ConflictException("This check run isn't running");

        this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(updated));

        return updated;
    }

    public async finish(rid: CheckRun.Rid, outcome: Internal.CheckRun.Finish.Request): Promise<CheckRun.Schema> {
        const current = await this.repository.checkRun.get(WORKER, rid);

        if (current?.status !== 'running')
            throw new ConflictException("This check run isn't running");

        const steps = CheckRun.Step.skipUnfinished(current.steps);
        const last = steps.length - 1;
        let status = outcome.status;
        let failure: CheckRun.Failure | null = null;
        let published = false;

        if (outcome.status === 'failed')
            failure = outcome.failure;

        if (outcome.status === 'succeeded') {
            const startedAt = new Date();

            try {
                const recipes = await this.publisher.publish(current, outcome.manifest);

                published = true;
                steps[last] = {
                    ...steps[last],
                    status:     'succeeded',
                    startedAt,
                    finishedAt: new Date(),
                    log:        `Published ${recipes.length} recipe(s)`,
                };
            }
            catch (error) {
                const message = getErrorMessage(error);

                status = 'failed';
                failure = { step: CheckRun.PUBLISH_STEP, message };
                steps[last] = {
                    ...steps[last],
                    status:     'failed',
                    startedAt,
                    finishedAt: new Date(),
                    log:        message,
                };
            }
        }

        // Also schedules the workspace's next waiting run, if any.
        const finished = await this.repository.finishCheckRun(WORKER, rid, { status, steps, failure, published });

        if (!finished)
            throw new ConflictException("This check run isn't running");

        this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(finished.run));

        if (finished.scheduled) {
            this.realtime.emitEvent(CodeWorkspace.Event.checkRunUpdated(finished.scheduled));
            await this.runCheckQueue.relay();
        }

        return finished.run;
    }

    /** Fails runs whose worker went silent, scheduling each workspace's next. */
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

        return { failed: failed.length, scheduled: scheduled.length };
    }
}
