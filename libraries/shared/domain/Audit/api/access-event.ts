import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Application } from "../../Platform/Application"
import { AccessEvent as AccessEventD } from "../AccessEvent"

/** Recents, and — for admins — the log. Opens are recorded by each resource's own open endpoint. */
export namespace AccessEvent {

    /** The caller's latest opens in one app, one per resource, newest first — only what they can still see. */
    export namespace Recents {
        export const Request = z.object({
            application: Application.Id,
            limit:       z.coerce.number().int().min(1).max(50).default(10),
        })
        export type  Request = z.input<typeof Request>

        export const Response = z.object({ recents: AccessEventD.Recent.array() })
        export type  Response = z.infer<typeof Response>
    }

    /** Admins only: events, filtered, newest first; page with `before` (the last id seen). */
    export namespace List {
        export const Request = z.object({
            resourceRid: z.string().optional(),
            userRid:     z.string().optional(),
            action:      AccessEventD.Action.optional(),
            from:        z.coerce.date().optional(),
            to:          z.coerce.date().optional(),
            before:      z.coerce.number().int().optional(),
            limit:       z.coerce.number().int().min(1).max(500).default(100),
        })
        export type  Request = z.input<typeof Request>

        export const Response = z.object({ events: AccessEventD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export async function recents(api: AxiosInstance, req: Recents.Request): Promise<Recents.Response> {
        const { data } = await api.get("/api/audit/recents", { params: req })
        return Recents.Response.parse(data)
    }

    export async function list(api: AxiosInstance, req: List.Request = {}): Promise<List.Response> {
        const { data } = await api.get("/api/audit/events", { params: req })
        return List.Response.parse(data)
    }
}
