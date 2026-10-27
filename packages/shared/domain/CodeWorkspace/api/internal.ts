import { z } from "zod"
import type { AxiosInstance } from "axios"
import { User } from "../../Identity/User"
import { Workspace as WorkspaceD } from "../Workspace"
import { CheckRun as CheckRunD } from "../CheckRun"
import { Check as CheckD } from "../Check"

/** Server endpoints only the code workspace worker calls (`/api/internal/…`, service token). */
export namespace Internal {

    /**
     * A session's credential, fetched by the worker each time it acts for one —
     * never sent with the server's request. The server checks the user may still read the
     * workspace, then mints a token that acts as them for a few hours.
     */
    export namespace SessionCredentials {
        export const Request = z.object({
            workspaceRid: WorkspaceD.Rid,
            userRid:      User.Rid,
        })
        export type Request = z.infer<typeof Request>

        export const Response = z.object({
            token: z.string().min(1),
            user:  z.object({ name: z.string(), email: z.email() }),          // the session's git author
        })
        export type Response = z.infer<typeof Response>
    }

    export async function getSessionCredentials(api: AxiosInstance, req: SessionCredentials.Request): Promise<SessionCredentials.Response> {
        const { data } = await api.post("/api/internal/code-workspaces/session-credentials", req)
        return SessionCredentials.Response.parse(data)
    }

    /** A check run, as the worker runs it (docs/design/code-workspaces/checks.md §3). Each answers 409 once the run isn't the worker's to run — canceled, or taken back. */
    export namespace CheckRun {

        export const Response = z.object({ checkRun: CheckRunD.Schema })
        export type  Response = z.infer<typeof Response>

        /** Taking a dispatched run — once: what to run, and a token acting as the pusher. */
        export namespace Start {
            export const Response = z.object({
                checkRun: CheckRunD.Schema,
                steps:    CheckD.Config.Step.array(),        // quarry-ci.yml's, in order
                token:    z.string().min(1),
            })
            export type Response = z.infer<typeof Response>
        }

        /** A step starting (`running`) or ending; `index` counts quarry-ci.yml's steps from 0. */
        export namespace Step {
            export const Request = z.object({
                status:     z.enum(CheckRunD.REPORTED_STEP_STATUSES),
                exitCode:   z.number().int().nullable().default(null),
                startedAt:  z.coerce.date(),
                finishedAt: z.coerce.date().nullable().default(null),
                log:        z.string().default(""),           // the server keeps the last LOG_TAIL_BYTES
            })
            export type Request = z.input<typeof Request>
        }

        export namespace Finish {
            export const Request = z.object({
                status:   z.enum(["succeeded", "failed"]),
                failure:  CheckRunD.Failure.nullable().default(null),   // when failed: which step, and why
                manifest: z.unknown().nullable().default(null),         // quarry/publish-transforms' output; checked by the server
            })
            export type Request = z.input<typeof Request>
        }

        /** The system worker's timer: send again what no worker took, fail silent runs, dispatch. */
        export namespace Sweep {
            export const Response = z.object({
                resent:     z.number().int(),
                failed:     z.number().int(),
                dispatched: z.number().int(),
            })
            export type Response = z.infer<typeof Response>
        }
    }

    export async function startCheckRun(api: AxiosInstance, rid: CheckRunD.Rid): Promise<CheckRun.Start.Response> {
        const { data } = await api.post(`/api/internal/code-workspaces/check-runs/${rid}/start`)
        return CheckRun.Start.Response.parse(data)
    }

    export async function reportCheckStep(api: AxiosInstance, rid: CheckRunD.Rid, index: number, req: CheckRun.Step.Request): Promise<CheckRun.Response> {
        const { data } = await api.post(`/api/internal/code-workspaces/check-runs/${rid}/steps/${index}`, req)
        return CheckRun.Response.parse(data)
    }

    export async function finishCheckRun(api: AxiosInstance, rid: CheckRunD.Rid, req: CheckRun.Finish.Request): Promise<CheckRun.Response> {
        const { data } = await api.post(`/api/internal/code-workspaces/check-runs/${rid}/finish`, req)
        return CheckRun.Response.parse(data)
    }

    export async function sweepCheckRuns(api: AxiosInstance): Promise<CheckRun.Sweep.Response> {
        const { data } = await api.post("/api/internal/code-workspaces/check-runs/sweep")
        return CheckRun.Sweep.Response.parse(data)
    }
}
