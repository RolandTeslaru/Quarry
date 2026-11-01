import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Foundations } from "../../../Foundations"
import { Workspace as WorkspaceD } from "../../Workspace"
import { CheckRun as CheckRunD } from "../CheckRun"
import * as InternalMod from "./internal"

/** CI's HTTP surface — the check-run endpoints of code-workspace.controller. */
export namespace API {

    /** The workspace's check runs, newest first — a page of them: `before` is the last RID seen. Needs read on the workspace. */
    export namespace ListCheckRuns {
        export const Query = z.object({
            branch: Foundations.Branch.optional(),
            before: CheckRunD.Rid.optional(),
            limit:  z.coerce.number().int().min(1).max(100).default(25),
        })
        export type  Query = z.infer<typeof Query>

        export const Response = z.object({
            checkRuns:  CheckRunD.Schema.array(),
            nextBefore: CheckRunD.Rid.nullable(),        // the next page's `before`; null: this was the last
        })
        export type  Response = z.infer<typeof Response>
    }

    export namespace GetCheckRun {
        export const Response = z.object({ checkRun: CheckRunD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export async function listCheckRuns(api: AxiosInstance, rid: WorkspaceD.Rid, query: z.input<typeof ListCheckRuns.Query> = {}): Promise<ListCheckRuns.Response> {
        const { data } = await api.get(`/api/code-workspaces/${rid}/check-runs`, { params: query })
        return ListCheckRuns.Response.parse(data)
    }

    export async function getCheckRun(api: AxiosInstance, rid: WorkspaceD.Rid, checkRunRid: CheckRunD.Rid): Promise<GetCheckRun.Response> {
        const { data } = await api.get(`/api/code-workspaces/${rid}/check-runs/${checkRunRid}`)
        return GetCheckRun.Response.parse(data)
    }

    /** Code-workspace-worker-only check-run endpoints (`/api/internal/…`). */
    export import Internal = InternalMod.Internal
}
