import { z } from 'zod';
import { CodeWorkspace, Foundations, Identity } from '@quarry/shared/domain';
import { defineDatabase } from '@/db/pool';
import type { Table } from '@/db/table';
import type { IdentityDB } from '@/services/Identity/identity.db';
import { LibraryDB } from '@/services/Library/library.db';

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
