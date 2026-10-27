import { Injectable } from '@nestjs/common';
import { CodeWorkspace, type Foundations } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { CodeWorkspaceDB } from '../code-workspace.db';
import type { Heads } from '../git/repositories';

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
    public async queue(principal: Principal.User, workspaceRid: CodeWorkspace.Rid, heads: Heads): Promise<QueuedCheckRuns> {
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
}
