import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { CodeWorkspace, type Foundations } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { CodeWorkspaceDB } from '../code-workspace.db';

export interface QueuedCheckRuns {
    readonly queued:   CodeWorkspace.CheckRun.Schema[];
    /** The same branches' earlier runs, superseded. */
    readonly canceled: CodeWorkspace.CheckRun.Schema[];
}

/** code_workspace.check_run. Reached through CodeWorkspaceRepository. */
@Injectable()
export class CheckRunRepository extends Repository(CodeWorkspaceDB.database) {

    /**
     * A queued check run per pushed head; the branch's unfinished runs canceled
     * first, so only the newest head is ever checked. Write on the workspace (RLS).
     */
    @Transactional('user')
    public async queue(principal: Principal.User, workspaceRid: CodeWorkspace.Rid, heads: CodeWorkspace.Git.Heads): Promise<QueuedCheckRuns> {
        const branches = Object.keys(heads) as Foundations.Branch[];

        if (branches.length === 0)
            return { queued: [], canceled: [] };

        const canceled = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'canceled', finished_at: new Date() })
            .where('workspace_rid', '=', workspaceRid)
            .where('branch', 'in', branches)
            .where('status', 'in', CodeWorkspace.CheckRun.UNFINISHED)
            .returningAll()
            .execute();

        const queued = await this.trx
            .insertInto('code_workspace.check_run')
            .values(branches.map(branch => ({
                rid:           CodeWorkspace.CheckRun.createRid(),
                workspace_rid: workspaceRid,
                branch,
                commit:        heads[branch],
                pushed_by:     principal.userRid,
            })))
            .returningAll()
            .execute();

        return {
            queued:   queued.map(CodeWorkspaceDB.CheckRun.toDomain),
            canceled: canceled.map(CodeWorkspaceDB.CheckRun.toDomain),
        };
    }

    /** A workspace's check runs, newest first — one branch's, or all. Read on the workspace (RLS). */
    @Transactional()
    public async list(principal: Principal, workspaceRid: CodeWorkspace.Rid, branch?: Foundations.Branch): Promise<CodeWorkspace.CheckRun.Schema[]> {
        let query = this.trx
            .selectFrom('code_workspace.check_run')
            .selectAll()
            .where('workspace_rid', '=', workspaceRid);

        if (branch)
            query = query.where('branch', '=', branch);

        const rows = await query.orderBy('created_at', 'desc').orderBy('rid', 'desc').execute();

        return rows.map(CodeWorkspaceDB.CheckRun.toDomain);
    }

    // ── running them (dispatch, the worker, the sweep — as the service) ──

    /** One check run, whatever its state. */
    @Transactional('service')
    public async get(principal: Principal.Service, rid: CodeWorkspace.CheckRun.Rid): Promise<CodeWorkspace.CheckRun.Schema | null> {
        const row = await this.trx
            .selectFrom('code_workspace.check_run')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    /** The oldest queued run whose workspace has none running — what dispatch sends next. Skips the given workspaces. */
    @Transactional('service')
    public async getNextQueued(principal: Principal.Service, skipWorkspaces: CodeWorkspace.Rid[]): Promise<CodeWorkspace.CheckRun.Schema | null> {
        let query = this.trx
            .selectFrom('code_workspace.check_run as q')
            .selectAll('q')
            .where('q.status', '=', 'queued')
            .where(({ not, exists, selectFrom }) => not(exists(
                selectFrom('code_workspace.check_run as r')
                    .select('r.rid')
                    .whereRef('r.workspace_rid', '=', 'q.workspace_rid')
                    .where('r.status', '=', 'running'),
            )));

        if (skipWorkspaces.length > 0)
            query = query.where('q.workspace_rid', 'not in', skipWorkspaces);

        const row = await query.orderBy('q.created_at').orderBy('q.rid').limit(1).executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    /**
     * `queued → running`, its steps laid out. Null if it's no longer queued (superseded meanwhile).
     * A second running run in the workspace breaks `check_run_one_running`: a 409, which dispatch skips.
     */
    @Transactional('service')
    public async claim(principal: Principal.Service, rid: CodeWorkspace.CheckRun.Rid, steps: CodeWorkspace.CheckRun.Step.Schema[]): Promise<CodeWorkspace.CheckRun.Schema | null> {
        const row = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'running', started_at: new Date(), steps: json(steps) })
            .where('rid', '=', rid)
            .where('status', '=', 'queued')
            .returningAll()
            .executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    /** `queued → failed` before it ran: quarry-ci.yml missing or invalid. */
    @Transactional('service')
    public async failUnclaimed(
        principal: Principal.Service,
        rid:       CodeWorkspace.CheckRun.Rid,
        steps:     CodeWorkspace.CheckRun.Step.Schema[],
        failure:   CodeWorkspace.CheckRun.Failure,
    ): Promise<CodeWorkspace.CheckRun.Schema | null> {
        const now = new Date();
        const row = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'failed', started_at: now, finished_at: now, steps: json(steps), failure: json(failure) })
            .where('rid', '=', rid)
            .where('status', '=', 'queued')
            .returningAll()
            .executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    /** `running → queued`: enqueueing failed (Redis down) and no worker has taken it. False if one has, or it's gone on. */
    @Transactional('service')
    public async release(principal: Principal.Service, rid: CodeWorkspace.CheckRun.Rid): Promise<boolean> {
        const result = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'queued', started_at: null, steps: json([]) })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .where('reported_at', 'is', null)
            .executeTakeFirst();

        return result.numUpdatedRows > 0n;
    }

    /** The worker takes it — once. Null if it isn't running, or a worker already took it. */
    @Transactional('service')
    public async start(principal: Principal.Service, rid: CodeWorkspace.CheckRun.Rid): Promise<CodeWorkspace.CheckRun.Schema | null> {
        const row = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ reported_at: new Date() })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .where('reported_at', 'is', null)
            .returningAll()
            .executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    /** One step's state, at its position in `steps`. Null if the run isn't the worker's any more. */
    @Transactional('service')
    public async reportStep(
        principal: Principal.Service,
        rid:       CodeWorkspace.CheckRun.Rid,
        position:  number,
        step:      CodeWorkspace.CheckRun.Step.Schema,
    ): Promise<CodeWorkspace.CheckRun.Schema | null> {
        const row = await this.trx
            .updateTable('code_workspace.check_run')
            .set({
                steps:       sql`jsonb_set(steps, ${`{${position}}`}::text[], ${json(step)})`,
                reported_at: new Date(),
            })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .where('reported_at', 'is not', null)
            .returningAll()
            .executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    /** `running → succeeded | failed`, with its final steps. Null if the run isn't the worker's any more. */
    @Transactional('service')
    public async finish(
        principal: Principal.Service,
        rid:       CodeWorkspace.CheckRun.Rid,
        outcome:   { status: 'succeeded' | 'failed'; steps: CodeWorkspace.CheckRun.Step.Schema[]; failure: CodeWorkspace.CheckRun.Failure | null },
    ): Promise<CodeWorkspace.CheckRun.Schema | null> {
        const row = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: outcome.status, steps: json(outcome.steps), failure: outcome.failure ? json(outcome.failure) : null, finished_at: new Date() })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .where('reported_at', 'is not', null)
            .returningAll()
            .executeTakeFirst();

        return row ? CodeWorkspaceDB.CheckRun.toDomain(row) : null;
    }

    /** Sent over `minutes` ago and never taken — Redis may have lost the message: what the sweep sends again. */
    @Transactional('service')
    public async listUntaken(principal: Principal.Service, minutes: number): Promise<CodeWorkspace.CheckRun.Schema[]> {
        const rows = await this.trx
            .selectFrom('code_workspace.check_run')
            .selectAll()
            .where('status', '=', 'running')
            .where('reported_at', 'is', null)
            .where('started_at', '<', sql<Date>`now() - make_interval(mins => ${minutes})`)
            .execute();

        return rows.map(CodeWorkspaceDB.CheckRun.toDomain);
    }

    /** Taken, then silent for `minutes`: the worker died. Failed; returns them. */
    @Transactional('service')
    public async failSilent(principal: Principal.Service, minutes: number, failure: CodeWorkspace.CheckRun.Failure): Promise<CodeWorkspace.CheckRun.Schema[]> {
        const rows = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'failed', failure: json(failure), finished_at: new Date() })
            .where('status', '=', 'running')
            .where('reported_at', '<', sql<Date>`now() - make_interval(mins => ${minutes})`)
            .returningAll()
            .execute();

        return rows.map(CodeWorkspaceDB.CheckRun.toDomain);
    }
}
