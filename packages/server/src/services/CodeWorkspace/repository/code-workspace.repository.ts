import { Injectable } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { DurableQueueHandle, InjectDurableQueue } from '@/infra/durable-queue';
import { CodeWorkspaceDB } from '../code-workspace.db';
import { CheckRunRepository, type NewCheckRun, type QueuedCheckRuns } from './check-run.repository';
import { WorkspaceRepository } from './workspace.repository';

import CheckRun = CodeWorkspace.CheckRun;

/**
 * The `code_workspace` schema. A write that spans tables — or a check run and its
 * message (the durable queue's outbox) — is a method here, so it is one
 * transaction. `workspace` and `checkRun` expose only what is safe on its own:
 * a complete state change, or a read.
 *
 * Check runs, one at a time per workspace: every write that frees a workspace —
 * a push superseding its run, a run finishing, a silent one failed — schedules
 * its next waiting run in the same transaction, adding its message to the durable
 * queue (docs/design/durable-queues.md); a worker's start acks it.
 */
@Injectable()
export class CodeWorkspaceRepository extends Repository(CodeWorkspaceDB.database) {

    public readonly workspace: Pick<WorkspaceRepository, 'create' | 'get' | 'open' | 'list'>;
    public readonly checkRun:  Pick<CheckRunRepository, 'list' | 'get' | 'reportStep'>;

    constructor(
        _workspace: WorkspaceRepository,
        private readonly _checkRun: CheckRunRepository,
        @InjectDurableQueue(CodeWorkspace.DurableQueue.RunCheck)
        private readonly _runCheckQueue: DurableQueueHandle<typeof CodeWorkspace.Queue.RunCheck.Definition>,
    ) {
        super();

        this.workspace = _workspace;
        this.checkRun = _checkRun;
    }

    /** A run per pushed head; the branches' earlier runs canceled (their messages acked); the workspace's next run scheduled, if it's free. */
    @Transactional('user')
    public async queueCheckRuns(principal: Principal.User, rid: CodeWorkspace.Rid, runs: NewCheckRun[]): Promise<QueuedCheckRuns> {
        const queued = await this._checkRun.queue(principal, rid, runs);

        await this._runCheckQueue.ack(queued.canceled.map(getJobId));

        return { ...queued, scheduled: await this._scheduleNext(principal, rid) };
    }

    /** A worker takes it: `scheduled → running` once, and its message acked. Null if it isn't scheduled. */
    @Transactional('service')
    public async startCheckRun(principal: Principal.Service, rid: CheckRun.Rid): Promise<CheckRun.Schema | null> {
        const run = await this._checkRun.start(principal, rid);

        if (run)
            await this._runCheckQueue.ack([getJobId(run)]);

        return run;
    }

    /** `running → succeeded | failed`, and the workspace's next run scheduled. Null if it isn't running. */
    @Transactional('service')
    public async finishCheckRun(
        principal: Principal.Service,
        rid:       CheckRun.Rid,
        outcome:   Parameters<CheckRunRepository['finish']>[2],
    ): Promise<{ run: CheckRun.Schema; scheduled: CheckRun.Schema | null } | null> {
        const run = await this._checkRun.finish(principal, rid, outcome);

        return run ? { run, scheduled: await this._scheduleNext(principal, run.workspaceRid) } : null;
    }

    /** Running runs silent for `minutes` → failed; each workspace's next run scheduled. */
    @Transactional('service')
    public async failSilentCheckRuns(
        principal: Principal.Service,
        minutes:   number,
        failure:   CheckRun.Failure,
    ): Promise<{ failed: CheckRun.Schema[]; scheduled: CheckRun.Schema[] }> {
        const failed = await this._checkRun.failSilent(principal, minutes, failure);
        const scheduled: CheckRun.Schema[] = [];

        for (const workspaceRid of new Set(failed.map(run => run.workspaceRid))) {
            const next = await this._scheduleNext(principal, workspaceRid);

            if (next)
                scheduled.push(next);
        }

        return { failed, scheduled };
    }

    /** The workspace's next run → `scheduled`, its message added — in the caller's transaction. */
    private async _scheduleNext(principal: Principal, workspaceRid: CodeWorkspace.Rid): Promise<CheckRun.Schema | null> {
        const run = await this._checkRun.scheduleNext(principal, workspaceRid);

        if (run)
            await this._runCheckQueue.add([{ message: { checkRunRid: run.rid }, jobId: getJobId(run) }]);

        return run;
    }
}

function getJobId(run: Pick<CheckRun.Schema, 'rid'>): string {
    return CodeWorkspace.Queue.RunCheck.getJobId(run);
}
