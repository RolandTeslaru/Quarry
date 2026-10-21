import { z } from "zod"
import type { AxiosInstance } from "axios"

/** Server endpoints only the system worker calls (`/api/internal/…`, service token). */
export namespace Internal {

    /** Unpublished catalog.outbox rows, oldest first. */
    export namespace PendingEvents {
        export const Response = z.object({
            events: z.object({ id: z.number().int(), event: z.string(), payload: z.record(z.string(), z.unknown()) }).array(),
        })
        export type Response = z.infer<typeof Response>
    }

    export namespace MarkPublished {
        export const Request = z.object({ ids: z.number().int().array() })
        export type  Request = z.infer<typeof Request>
    }

    /** Abort transactions open longer than `staleOpenHours`; delete the files of those aborted in the last `sweepAbortedDays`. */
    export namespace StorageGc {
        export const Request  = z.object({ staleOpenHours: z.number().int().positive(), sweepAbortedDays: z.number().int().positive() })
        export type  Request  = z.infer<typeof Request>
        export const Response = z.object({ aborted: z.number().int(), filesDeleted: z.number().int() })
        export type  Response = z.infer<typeof Response>
    }

    export async function pendingEvents(api: AxiosInstance, limit: number): Promise<PendingEvents.Response> {
        const { data } = await api.get("/api/internal/outbox", { params: { limit } })
        return PendingEvents.Response.parse(data)
    }

    export async function markPublished(api: AxiosInstance, req: MarkPublished.Request): Promise<void> {
        await api.post("/api/internal/outbox/published", req)
    }

    export async function storageGc(api: AxiosInstance, req: StorageGc.Request): Promise<StorageGc.Response> {
        const { data } = await api.post("/api/internal/storage-gc", req)
        return StorageGc.Response.parse(data)
    }
}
