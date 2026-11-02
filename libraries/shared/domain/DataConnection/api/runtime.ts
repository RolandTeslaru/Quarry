import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Job } from "../../Forge/Job"
import { Source as SourceD } from "../Source"

/** A running sync job's runtime only (`/api/data-connection/jobs/…`, the job's token) — mirrors the data-connection runtime-http controller. */
export namespace Runtime {

    /** What the job connects to: its source, and the credential's values, decrypted. */
    export namespace GetConnection {
        export const Response = z.object({
            source:     SourceD.Schema,
            credential: z.unknown(),
        })
        export type  Response = z.infer<typeof Response>
    }

    export async function getConnection(api: AxiosInstance, jobRid: Job.Rid): Promise<GetConnection.Response> {
        const { data } = await api.get(`/api/data-connection/jobs/${jobRid}/connection`)
        return GetConnection.Response.parse(data)
    }
}
