import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Job as JobD } from "../Job"
import { Recipe as RecipeD } from "../Recipe"

/** ForgeAgents only (`/api/forge-agent/…`, the ForgeAgent token) — mirrors forge-agent.controller. */
export namespace Agent {

    /** Take the job (`scheduled` → `running`, once per attempt). */
    export namespace Start {
        export const Request = z.object({ attempt: z.number().int().positive() })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({
            job:     JobD.Schema,
            recipe: RecipeD.Schema,
        })
        export type  Response = z.infer<typeof Response>
    }

    /** Still running. The reply says whether to carry on. */
    export namespace Heartbeat {
        export const Request = z.object({ attempt: z.number().int().positive() })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ action: z.enum(["continue", "stop"]) })
        export type  Response = z.infer<typeof Response>
    }

    /** How the attempt ended. Idempotent: a repeat after it was recorded is accepted. */
    export namespace Finish {
        export const Request = z.object({
            attempt: z.number().int().positive(),
            status:  z.enum(["succeeded", "failed"]),
            failure: z.object({ message: z.string() }).nullable().default(null),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ job: JobD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export async function start(api: AxiosInstance, rid: JobD.Rid, req: Start.Request): Promise<Start.Response> {
        const { data } = await api.post(`/api/forge-agent/jobs/${rid}/start`, req)
        return Start.Response.parse(data)
    }

    export async function heartbeat(api: AxiosInstance, rid: JobD.Rid, req: Heartbeat.Request): Promise<Heartbeat.Response> {
        const { data } = await api.post(`/api/forge-agent/jobs/${rid}/heartbeat`, req)
        return Heartbeat.Response.parse(data)
    }

    export async function finish(api: AxiosInstance, rid: JobD.Rid, req: z.input<typeof Finish.Request>): Promise<Finish.Response> {
        const { data } = await api.post(`/api/forge-agent/jobs/${rid}/finish`, req)
        return Finish.Response.parse(data)
    }
}
