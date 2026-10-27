import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { CodeWorkspace, Foundations, Identity, Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { defineDatabase } from '@/db/pool';
import { Repository, Transactional } from '@/db/repository';
import type { Table } from '@/db/table';
import { isLive } from '@/db/liveness';
import { AuditRepository } from '@/services/Audit/audit.repository';
import type { IdentityDB } from '@/services/Identity/identity.db';
import { LibraryDB } from '@/services/Library/library.db';
import { EnsureResource } from '@/services/Library/ensure-resource';
import { ResourceRepository } from '@/services/Library/resource.repository';
import type { Heads } from './git/repositories';

/** The `code_workspace` schema: Code Workspaces. */
export namespace CodeWorkspaceDB {

    export namespace Workspace {
        export const Row = z.object({
            rid:         CodeWorkspace.Rid,
            type:        z.literal('workspace'),
            template_id: CodeWorkspace.Template.Id,
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Pick<Row, 'template_id'>, resource: LibraryDB.Resource.Row) => CodeWorkspace.Schema.parse({
            ...LibraryDB.Resource.toBase(resource),
            templateId: row.template_id,
        });
    }

    export namespace CheckRun {
        export const Row = z.object({
            rid:           CodeWorkspace.CheckRun.Rid,
            workspace_rid: CodeWorkspace.Rid,
            branch:        Foundations.Branch,
            commit:        CodeWorkspace.Commit,
            status:        CodeWorkspace.CheckRun.Status,
            steps:         CodeWorkspace.CheckRun.Step.Schema.array(),
            published:     z.boolean(),
            failure:       CodeWorkspace.CheckRun.Failure.nullable(),
            pushed_by:     Identity.User.Rid.nullable(),
            created_at:    z.date(),
            started_at:    z.date().nullable(),
            finished_at:   z.date().nullable(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => CodeWorkspace.CheckRun.Schema.parse({
            rid:          row.rid,
            workspaceRid: row.workspace_rid,
            branch:       row.branch,
            commit:       row.commit,
            status:       row.status,
            steps:        row.steps,
            published:    row.published,
            failure:      row.failure,
            pushedBy:     row.pushed_by,
            createdAt:    row.created_at,
            startedAt:    row.started_at,
            finishedAt:   row.finished_at,
        });
    }

    export interface Tables {
        'code_workspace.workspace': Table<typeof Workspace.Row, 'type'>;
        'code_workspace.check_run': Table<typeof CheckRun.Row, 'status' | 'steps' | 'published' | 'failure' | 'created_at' | 'started_at' | 'finished_at'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}

export interface QueuedCheckRuns {
    readonly queued:   CodeWorkspace.CheckRun.Schema[];
    /** The same branches' earlier runs, superseded. */
    readonly canceled: CodeWorkspace.CheckRun.Schema[];
}

@Injectable()
export class CodeWorkspaceRepository extends Repository(CodeWorkspaceDB.database) {

    constructor(
        readonly resources:     ResourceRepository,          // @EnsureResource's
        private readonly audit: AuditRepository,
    ) {
        super();
    }

    /** Library row (via @EnsureResource) + workspace row, in one transaction. */
    @Transactional()
    @EnsureResource('workspace')
    async create(principal: Principal, values: {
        rid:         CodeWorkspace.Rid;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid;
        templateId:  CodeWorkspace.Template.Id;
    }): Promise<CodeWorkspace.Schema> {
        const row = await this.trx
            .insertInto('code_workspace.workspace')
            .values({
                rid:         values.rid,
                template_id: values.templateId,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return CodeWorkspaceDB.Workspace.toDomain(row, this.resource);
    }

    /** Live only: @Transactional checks the workspace and its ancestors aren't trashed. */
    @Transactional()
    async get(principal: Principal, rid: CodeWorkspace.Rid): Promise<CodeWorkspace.Schema | null> {
        const row = await this.trx
            .selectFrom('code_workspace.workspace as w')
            .innerJoin('library.resource as r', 'r.rid', 'w.rid')
            .selectAll('r')
            .select('w.template_id')
            .where('w.rid', '=', rid)
            .executeTakeFirst();

        if (!row)
            return null;

        const { template_id, ...resource } = row;

        return CodeWorkspaceDB.Workspace.toDomain({ template_id }, resource);
    }

    /** An app opening the workspace's page: it, and the audit `open`, in one transaction. Null: not there, or not theirs to see. */
    @Transactional('user')
    async open(principal: Principal.User, rid: CodeWorkspace.Rid, application: Platform.Application.Id): Promise<CodeWorkspace.Schema | null> {
        const workspace = await this.get(principal, rid);           // joins this transaction

        if (workspace)
            await this.audit.recordOpen(principal, { rid, type: 'workspace', application });   // joins this transaction

        return workspace;
    }

    /**
     * A queued check run per pushed head; the branch's unfinished runs canceled
     * first, so only the newest head is ever checked. Write on the workspace (RLS).
     */
    @Transactional('user')
    async queueCheckRuns(principal: Principal.User, rid: CodeWorkspace.Rid, heads: Heads): Promise<QueuedCheckRuns> {
        const branches = Object.keys(heads) as Foundations.Branch[];

        if (branches.length === 0)
            return { queued: [], canceled: [] };

        const canceled = await this.trx
            .updateTable('code_workspace.check_run')
            .set({ status: 'canceled', finished_at: new Date() })
            .where('workspace_rid', '=', rid)
            .where('branch', 'in', branches)
            .where('status', 'in', CodeWorkspace.CheckRun.UNFINISHED)
            .returningAll()
            .execute();

        const queued = await this.trx
            .insertInto('code_workspace.check_run')
            .values(branches.map(branch => ({
                rid:           CodeWorkspace.CheckRun.createRid(),
                workspace_rid: rid,
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
    async listCheckRuns(principal: Principal, rid: CodeWorkspace.Rid, branch?: Foundations.Branch): Promise<CodeWorkspace.CheckRun.Schema[]> {
        let query = this.trx
            .selectFrom('code_workspace.check_run')
            .selectAll()
            .where('workspace_rid', '=', rid);

        if (branch)
            query = query.where('branch', '=', branch);

        const rows = await query.orderBy('created_at', 'desc').orderBy('rid', 'desc').execute();

        return rows.map(CodeWorkspaceDB.CheckRun.toDomain);
    }

    /** Every live workspace the user can discover (RLS), across projects. */
    @Transactional()
    async list(principal: Principal): Promise<CodeWorkspace.Schema[]> {
        const rows = await this.trx
            .selectFrom('code_workspace.workspace as w')
            .innerJoin('library.resource as r', 'r.rid', 'w.rid')
            .selectAll('r')
            .select('w.template_id')
            .where(isLive('r.rid'))
            .orderBy('r.name')
            .execute();

        return rows.map(({ template_id, ...resource }) => CodeWorkspaceDB.Workspace.toDomain({ template_id }, resource));
    }
}
