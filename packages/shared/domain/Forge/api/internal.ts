import { z } from "zod"
import type { AxiosInstance } from "axios"

/** Server endpoints only the system worker calls (`/api/internal/forge/…`, service token). */
export namespace Internal {

    /** Re-send scheduled jobs, and queued ones no ForgeAgent started within `staleQueuedMinutes`. */
    export namespace RelaySweep {
        export const Request  = z.object({ staleQueuedMinutes: z.number().int().positive() })
        export type  Request  = z.infer<typeof Request>
        export const Response = z.object({ relayed: z.number().int() })
        export type  Response = z.infer<typeof Response>
    }

    export async function relaySweep(api: AxiosInstance, req: RelaySweep.Request): Promise<RelaySweep.Response> {
        const { data } = await api.post("/api/internal/forge/relay-sweep", req)
        return RelaySweep.Response.parse(data)
    }
}
