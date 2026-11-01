import { z } from "zod"
import type { AxiosInstance } from "axios"

/** Server endpoints only the system worker calls (`/api/internal/…`, service token). */
export namespace Internal {

    /** Abort transactions open longer than `staleOpenHours`; delete the files of those aborted in the last `sweepAbortedDays`. */
    export namespace StorageGc {
        export const Request  = z.object({ staleOpenHours: z.number().int().positive(), sweepAbortedDays: z.number().int().positive() })
        export type  Request  = z.infer<typeof Request>
        export const Response = z.object({ aborted: z.number().int(), filesDeleted: z.number().int() })
        export type  Response = z.infer<typeof Response>
    }

    export async function storageGc(api: AxiosInstance, req: StorageGc.Request): Promise<StorageGc.Response> {
        const { data } = await api.post("/api/internal/storage-gc", req)
        return StorageGc.Response.parse(data)
    }
}
