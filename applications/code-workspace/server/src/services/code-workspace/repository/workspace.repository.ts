import { Injectable } from '@nestjs/common';
import { CodeWorkspace, Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { isLive } from '@quarry/platform-kernel/db/liveness';
import { AuditRepository } from '@quarry/platform-kernel/services/Audit/audit.repository';
import { EnsureResource } from '@quarry/platform-kernel/services/Library/ensure-resource';
import { ResourceRepository } from '@quarry/platform-kernel/services/Library/resource.repository';
import { CodeWorkspaceDB } from '../code-workspace.db';

/** code_workspace.workspace (and its library row). Reached through CodeWorkspaceRepository. */
@Injectable()
export class WorkspaceRepository extends Repository(CodeWorkspaceDB.database) {

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
    }): Promise<CodeWorkspace> {
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
    async get(principal: Principal, rid: CodeWorkspace.Rid): Promise<CodeWorkspace | null> {
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
    async open(principal: Principal.User, rid: CodeWorkspace.Rid, application: Platform.Application.Id): Promise<CodeWorkspace | null> {
        const workspace = await this.get(principal, rid);           // joins this transaction

        if (workspace)
            await this.audit.recordOpen(principal, { rid, type: 'workspace', application });   // joins this transaction

        return workspace;
    }

    /** Every live workspace the user can discover (RLS), across projects. */
    @Transactional()
    async list(principal: Principal): Promise<CodeWorkspace[]> {
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
