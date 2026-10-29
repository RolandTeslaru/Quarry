import { z } from "zod"
import type { AxiosInstance } from "axios"
import { CheckRun as CheckRunD } from "../CheckRun"
import { Check as CheckD } from "../Check"

/** CI's server endpoints only the code workspace worker calls (`/api/internal/…`, service token). */
export namespace Internal {

    /** A check run, as the worker runs it (docs/design/code-workspaces/checks.md §3). Each answers 409 once the run isn't the worker's to run — canceled, or already taken. */
    export namespace CheckRun {

        export const Response = z.object({ checkRun: CheckRunD.Schema })
        export type  Response = z.infer<typeof Response>

        /** Taking a scheduled run — once: what to run, and a token acting as the pusher. */
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
            export type Request = z.infer<typeof Request>
            export type Input   = z.input<typeof Request>
        }

        export namespace Finish {
            export const Request = z.discriminatedUnion("status", [
                z.object({
                    status:   z.literal("succeeded"),
                    manifest: z.unknown().nullable().default(null),     // quarry/publish-transforms' output; checked by the server
                }),
                z.object({
                    status:  z.literal("failed"),
                    failure: CheckRunD.Failure,
                }),
            ])
            export type Request = z.infer<typeof Request>
            export type Input   = z.input<typeof Request>
        }

        /** The system worker's timer: fail silent runs, schedule what's waiting. */
        export namespace Sweep {
            export const Response = z.object({
                failed:    z.number().int(),
                scheduled: z.number().int(),
            })
            export type Response = z.infer<typeof Response>
        }
    }

    export async function startCheckRun(api: AxiosInstance, rid: CheckRunD.Rid): Promise<CheckRun.Start.Response> {
        const { data } = await api.post(`/api/internal/code-workspaces/check-runs/${rid}/start`)
        return CheckRun.Start.Response.parse(data)
    }

    export async function reportCheckStep(api: AxiosInstance, rid: CheckRunD.Rid, index: number, req: CheckRun.Step.Input): Promise<CheckRun.Response> {
        const { data } = await api.post(`/api/internal/code-workspaces/check-runs/${rid}/steps/${index}`, req)
        return CheckRun.Response.parse(data)
    }

    export async function finishCheckRun(api: AxiosInstance, rid: CheckRunD.Rid, req: CheckRun.Finish.Input): Promise<CheckRun.Response> {
        const { data } = await api.post(`/api/internal/code-workspaces/check-runs/${rid}/finish`, req)
        return CheckRun.Response.parse(data)
    }

    export async function sweepCheckRuns(api: AxiosInstance): Promise<CheckRun.Sweep.Response> {
        const { data } = await api.post("/api/internal/code-workspaces/check-runs/sweep")
        return CheckRun.Sweep.Response.parse(data)
    }
}
