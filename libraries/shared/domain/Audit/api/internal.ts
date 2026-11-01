import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Queue } from "../queue"

/** The main server's internal Audit endpoints — the system worker's, with the service token. */
export namespace Internal {

    /** Stores one audit.record message and acks it, in one transaction; again with the same job id: nothing. */
    export namespace StoreRecord {
        export const Request = z.object({
            jobId:  z.string().min(1),
            record: Queue.Record.Job,
        })
        export type  Request = z.infer<typeof Request>
    }

    export async function storeRecord(api: AxiosInstance, request: z.input<typeof StoreRecord.Request>): Promise<void> {
        await api.post("/api/internal/audit/records", request)
    }
}
