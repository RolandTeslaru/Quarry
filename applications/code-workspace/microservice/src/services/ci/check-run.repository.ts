import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { CodeWorkspace, type Foundations } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { json } from '@quarry/platform-kernel/db/table';
import { DurableQueueHandle, InjectDurableQueue } from '@quarry/platform-kernel/infra/durable-queue';
import { CodeWorkspaceDB } from '../code-workspace/code-workspace.db';

import CI = CodeWorkspace.CI;
import CheckRun = CodeWorkspace.CI.CheckRun;

/** A pushed head's run, its quarry-ci.yml already read: steps laid out — or, if the file is missing or invalid, failed at Parse. */
export interface NewCheckRun {
    readonly branch:  Foundations.Branch;
    readonly commit:  CodeWorkspace.Git.Commit;
    readonly steps:   CheckRun.Step[];
    readonly failure: CheckRun.Failure | null;
}

export interface QueuedCheckRuns {
    readonly queued:    CheckRun[];
    /** The same branches' earlier runs, superseded. */
    readonly canceled:  CheckRun[];
    /** The workspace's next run, if the push left it free — maybe one of `queued`. */
    readonly scheduled: CheckRun | null;
}

/**
 * code_workspace.check_run, and each run's message: a write that adds or acks one (the durable
 * queue's outbox, docs/design/durable-queues.md) is one transaction with it.
 *
 * Check runs, one at a time per workspace: every write that frees a workspace — a push
 * superseding its run, a run finishing, a silent one failed — schedules its next waiting run
 * in the same transaction, adding its message; a worker's start acks it.
 */
@Injectable()
export class CheckRunRepository extends Repository(CodeWorkspaceDB.database) {

    constructor(
        @InjectDurableQueue(CI.DurableQueue.RunCheck)
        private readonly runCheckQueue: DurableQueueHandle<typeof CI.Queue.RunCheck.Definition>,
    ) {
        super();
    }

    /**
     * A run per pushed head — `waiting`, or `failed` at Parse — the branches' unfinished runs canceled
     * first (their messages acked), so only the newest head is ever checked; the workspace's next run
     * scheduled, if it's free. Write on the workspace (RLS).
     */
    @Transactional('user')
    public async queue(principal: Principal.User, workspaceRid: CodeWorkspace.Rid, runs: NewCheckRun[]): Promise<QueuedCheckRuns> {
        if (runs.length === 0)
            return { queued: [], canceled: [], scheduled: await this.scheduleNext(principal, workspaceRid) };

        const now = new Date();

        const canceled = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'canceled', finished_at: now })
            .where('workspace_rid', '=', workspaceRid)
            .where('branch', 'in', runs.map(run => run.branch))
            .where('status', 'in', CheckRun.UNFINISHED)
            .returningAll()
            .execute();

        const queued = await this.trx
            .insertInto('code_workspace.check_run')
            .values(runs.map(run => ({
                rid:           CheckRun.createRid(),
                workspace_rid: workspaceRid,
                branch:        run.branch,
                commit:        run.commit,
                pushed_by:     principal.userRid,
                steps:         json(run.steps),
                ...(run.failure ? { status: 'failed' as const, failure: json(run.failure), finished_at: now } : {}),
            })))
            .returningAll()
            .execute();

        const superseded = canceled.map(CodeWorkspaceDB.CheckRun.toDomain);

        await this.runCheckQueue.ack(superseded.map(getQueueJobId));

        return {
            queued:    queued.map(CodeWorkspaceDB.CheckRun.toDomain),
            canceled:  superseded,
            scheduled: await this.scheduleNext(principal, workspaceRid),
        };
    }

    /**
     * A page of the workspace's check runs, newest first: up to `limit`, older than `before`
     * (a run's RID — keyset paging, so runs arriving meanwhile don't shift the pages). Read on the workspace (RLS).
     */
    @Transactional()
    public async list(
        principal:    Principal,
        workspaceRid: CodeWorkspace.Rid,
        page:         { branch?: Foundations.Branch; before?: CheckRun.Rid; limit: number },
    ): Promise<CheckRun[]> {
        let query = this.trx
            .selectFrom('code_workspace.check_run')
            .selectAll()
            .where('workspace_rid', '=', workspaceRid);

        if (page.branch)
            query = query.where('branch', '=', page.branch);

        if (page.before)
            query = query.where(sql<boolean>`(created_at, rid) < (select created_at, rid from code_workspace.check_run where rid = ${page.before})`);

        const rows = await query.orderBy('created_at', 'desc').orderBy('rid', 'desc').limit(page.limit).execute();

        return rows.map(CodeWorkspaceDB.CheckRun.toDomain);
    }

    /** One of the workspace's check runs. Null if there's no such run there, or it isn't the principal's to see (RLS). */
    @Transactional()
    public async getInWorkspace(principal: Principal, workspaceRid: CodeWorkspace.Rid, rid: CheckRun.Rid): Promise<CheckRun | null> {
        const row = await this.trx
            .selectFrom('code_workspace.check_run')
            .selectAll()
            .where('workspace_rid', '=', workspaceRid)
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    // ── running them (the worker, the sweep — as the service) ──

    /** One check run, whatever its state. */
    @Transactional('service')
    public async get(principal: Principal.Service, rid: CheckRun.Rid): Promise<CheckRun | null> {
        const row = await this.trx
            .selectFrom('code_workspace.check_run')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    /**
     * The workspace's oldest waiting run → `scheduled`, its message added, if it has none scheduled or
     * running. Null otherwise. Serialized per workspace (a transaction-scoped advisory lock), so two transactions
     * freeing it at once schedule one run — the unique index never has to refuse, which would abort
     * the caller's whole transaction.
     */
    @Transactional()
    private async scheduleNext(principal: Principal, workspaceRid: CodeWorkspace.Rid): Promise<CheckRun | null> {
        await sql`select pg_advisory_xact_lock(hashtextextended(${workspaceRid}, 0))`.execute(this.trx);

        const row = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'scheduled', scheduled_at: new Date() })
            .where('rid', '=', (eb) => eb
                .selectFrom('code_workspace.check_run as w')
                .select('w.rid')
                .where('w.workspace_rid', '=', workspaceRid)
                .where('w.status', '=', 'waiting')
                .where(({ not, exists, selectFrom }) => not(exists(
                    selectFrom('code_workspace.check_run as r')
                        .select('r.rid')
                        .where('r.workspace_rid', '=', workspaceRid)
                        .where('r.status', 'in', ['scheduled', 'running']),
                )))
                .orderBy('w.created_at').orderBy('w.rid')
                .limit(1))
            .returningAll()
            .executeTakeFirst();

        if (!row)
            return null;

        const run = CodeWorkspaceDB.CheckRun.toDomain(row);

        await this.runCheckQueue.add([{ message: { checkRunRid: run.rid }, jobId: getQueueJobId(run) }]);

        return run;
    }

    /** A worker takes it: `scheduled → running` — once — and its message acked. Null if it isn't scheduled (taken, or canceled). */
    @Transactional('service')
    public async start(principal: Principal.Service, rid: CheckRun.Rid): Promise<CheckRun | null> {
        const now = new Date();
        const row = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'running', started_at: now, reported_at: now })
            .where('rid', '=', rid)
            .where('status', '=', 'scheduled')
            .returningAll()
            .executeTakeFirst();

        if (!row)
            return null;

        const run = CodeWorkspaceDB.CheckRun.toDomain(row);

        await this.runCheckQueue.ack([getQueueJobId(run)]);

        return run;
    }

    /** One step's state, at its position in `steps`. Null if the run isn't running (any more). */
    @Transactional('service')
    public async reportStep(principal: Principal.Service, rid: CheckRun.Rid, position: number, step: CheckRun.Step): Promise<CheckRun | null> {
        const row = await this.trx
            .updateTable('code_workspace.check_run')
            .set({
                steps:       sql`jsonb_set(steps, ${`{${position}}`}::text[], ${json(step)})`,
                reported_at: new Date(),
            })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .returningAll()
            .executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    /** `running → succeeded | failed`, with its final steps — and whether its recipes were published — and the workspace's next run scheduled. Null if the run isn't running (any more). */
    @Transactional('service')
    public async finish(
        principal: Principal.Service,
        rid:       CheckRun.Rid,
        outcome:   { status: 'succeeded' | 'failed'; steps: CheckRun.Step[]; failure: CheckRun.Failure | null; published?: boolean },
    ): Promise<{ run: CheckRun; scheduled: CheckRun | null } | null> {
        const row = await this.trx
            .updateTable('code_workspace.check_run')
            .set({
                status:      outcome.status,
                steps:       json(outcome.steps),
                failure:     outcome.failure ? json(outcome.failure) : null,
                published:   outcome.published ?? false,
                finished_at: new Date(),
            })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .returningAll()
            .executeTakeFirst();

        if (!row)
            return null;

        const run = CodeWorkspaceDB.CheckRun.toDomain(row);

        return { run, scheduled: await this.scheduleNext(principal, run.workspaceRid) };
    }

    /** Running, then silent for `minutes`: the worker died. Failed, and each workspace's next run scheduled. */
    @Transactional('service')
    public async failSilent(principal: Principal.Service, minutes: number, failure: CheckRun.Failure): Promise<{ failed: CheckRun[]; scheduled: CheckRun[] }> {
        const rows = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'failed', failure: json(failure), finished_at: new Date() })
            .where('status', '=', 'running')
            .where('reported_at', '<', sql<Date>`now() - make_interval(mins => ${minutes})`)
            .returningAll()
            .execute();

        const failed = rows.map(CodeWorkspaceDB.CheckRun.toDomain);
        const workspaceRids = new Set<CodeWorkspace.Rid>();
        const scheduled: CheckRun[] = [];

        for (const run of failed)
            workspaceRids.add(run.workspaceRid);

        for (const workspaceRid of workspaceRids) {
            const next = await this.scheduleNext(principal, workspaceRid);

            if (next)
                scheduled.push(next);
        }

        return { failed, scheduled };
    }
}

function getQueueJobId(run: Pick<CheckRun, 'rid'>): string {
    return CI.Queue.RunCheck.getQueueJobId(run);
}
