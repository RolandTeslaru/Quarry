import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Application } from "../../Platform/Application"
import { Dataset as DatasetD } from "../../Catalog/Dataset"
import { Resource as ResourceD } from "../../Library/Resource"
import { Template as TemplateD } from "../Template"
import { Workspace as WorkspaceD } from "../Workspace"
import { CheckRun as CheckRunD } from "../CheckRun"
import { Foundations } from "../../Foundations"
import * as InternalMod from "./internal"
import * as WorkerMod from "./worker"

/** Code Workspaces' HTTP surface — mirrors code-workspace.controller. */
export namespace API {


    /** Every template the deployment declares — by id. */
    export namespace ListTemplates {
        export const Response = z.object({ templates: z.record(TemplateD.Id, TemplateD.Schema) })   // by id
        export type  Response = z.infer<typeof Response>
    }

    /** Workspaces the caller can discover, across projects — the app's home. */
    export namespace List {
        export const Response = z.object({ workspaces: WorkspaceD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Create {
        export const Request = z.object({
            parentRid:   ResourceD.Rid,
            name:        ResourceD.Name,
            description: z.string().nullable().default(null),
            templateId:  TemplateD.Id,
            /** The example transform reads this dataset (and writes `<its name> (clean)` beside the workspace); null: the example is commented out. */
            exampleInputRid: DatasetD.Rid.nullable().default(null),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ workspace: WorkspaceD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Open {
        /** Which app opened it — recorded with the open. */
        export const Request = z.object({ application: Application.Id })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ workspace: WorkspaceD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Get {
        export const Response = z.object({ workspace: WorkspaceD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** Starts the caller's session on the workspace (or reuses it): the IDE's URL, for an iframe. */
    export namespace OpenSession {
        export const Response = z.object({ url: z.url() })
        export type  Response = z.infer<typeof Response>
    }

    /**
     * Replaces the caller's session with a fresh container from the current runtime image — the working copy
     * (its volume) stays: the IDE's new URL.
     */
    export namespace RestartSession {
        export const Response = z.object({ url: z.url() })
        export type  Response = z.infer<typeof Response>
    }

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

    export async function listTemplates(api: AxiosInstance): Promise<ListTemplates.Response> {
        const { data } = await api.get("/api/code-workspaces/templates")
        return ListTemplates.Response.parse(data)
    }

    export async function list(api: AxiosInstance): Promise<List.Response> {
        const { data } = await api.get("/api/code-workspaces")
        return List.Response.parse(data)
    }

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/code-workspaces", req)
        return Create.Response.parse(data)
    }

    export async function open(api: AxiosInstance, rid: WorkspaceD.Rid, req: Open.Request): Promise<Open.Response> {
        const { data } = await api.post(`/api/code-workspaces/${rid}/open`, req)
        return Open.Response.parse(data)
    }

    export async function get(api: AxiosInstance, rid: WorkspaceD.Rid): Promise<Get.Response> {
        const { data } = await api.get(`/api/code-workspaces/${rid}`)
        return Get.Response.parse(data)
    }

    export async function openSession(api: AxiosInstance, rid: WorkspaceD.Rid): Promise<OpenSession.Response> {
        const { data } = await api.post(`/api/code-workspaces/${rid}/session`)
        return OpenSession.Response.parse(data)
    }

    export async function restartSession(api: AxiosInstance, rid: WorkspaceD.Rid): Promise<RestartSession.Response> {
        const { data } = await api.post(`/api/code-workspaces/${rid}/session/restart`)
        return RestartSession.Response.parse(data)
    }

    export async function listCheckRuns(api: AxiosInstance, rid: WorkspaceD.Rid, query: z.input<typeof ListCheckRuns.Query> = {}): Promise<ListCheckRuns.Response> {
        const { data } = await api.get(`/api/code-workspaces/${rid}/check-runs`, { params: query })
        return ListCheckRuns.Response.parse(data)
    }

    export async function getCheckRun(api: AxiosInstance, rid: WorkspaceD.Rid, checkRunRid: CheckRunD.Rid): Promise<GetCheckRun.Response> {
        const { data } = await api.get(`/api/code-workspaces/${rid}/check-runs/${checkRunRid}`)
        return GetCheckRun.Response.parse(data)
    }

    /** Code-workspace-worker-only endpoints (`/api/internal/…`). */
    export import Internal = InternalMod.Internal

    /** The code workspace worker's own endpoints — the server calls them. */
    export import Worker = WorkerMod.Worker
}
