import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Dataset as DatasetD } from "../../Dataset/Dataset"
import { SignedUrl } from "../../Catalog/SignedUrl"
import { Job as JobD } from "../Job"

/** A running job's runtime only (`/api/forge/jobs/…`, the job's token) — mirrors the job runtime-http controller. */
export namespace Runtime {

    /** The running job's pinned inputs, each as signed read URLs — for its runtime, with the job's token. */
    export namespace GetSignedInputUrls {
        export const Response = z.object({ inputs: z.record(DatasetD.Rid, SignedUrl.Read.Schema) })
        export type  Response = z.infer<typeof Response>
    }

    /** A file of a job's output, as its runtime names it: plain, and Parquet. */
    export const OutputFilename = z.string().regex(/^[A-Za-z0-9._-]+\.parquet$/, "a file name like part-0.parquet")

    /** Where the running job's runtime uploads one file of an output: a URL that PUTs it, without credentials. */
    export namespace GetSignedOutputUrl {
        export const Request = z.object({ filename: OutputFilename })
        export type  Request = z.infer<typeof Request>

        export const Response = SignedUrl.Write.Schema
        export type  Response = z.infer<typeof Response>
    }

    /** A file the runtime uploaded, registered on its output: its footer is read, and it joins the output's next version. */
    export namespace RegisterOutputFile {
        export const Request = z.object({
            filename: OutputFilename,
            bytes:    z.number().int().nonnegative(),
        })
        export type  Request = z.infer<typeof Request>
    }

    export async function getSignedInputUrls(api: AxiosInstance, rid: JobD.Rid): Promise<GetSignedInputUrls.Response> {
        const { data } = await api.get(`/api/forge/jobs/${rid}/signed-input-urls`)
        return GetSignedInputUrls.Response.parse(data)
    }

    export async function getSignedOutputUrl(
        api:        AxiosInstance,
        rid:        JobD.Rid,
        datasetRid: DatasetD.Rid,
        req:        GetSignedOutputUrl.Request,
    ): Promise<GetSignedOutputUrl.Response> {
        const { data } = await api.post(`/api/forge/jobs/${rid}/outputs/${datasetRid}/signed-url`, req)
        return GetSignedOutputUrl.Response.parse(data)
    }

    export async function registerOutputFile(api: AxiosInstance, rid: JobD.Rid, datasetRid: DatasetD.Rid, req: RegisterOutputFile.Request): Promise<void> {
        await api.post(`/api/forge/jobs/${rid}/outputs/${datasetRid}/files`, req)
    }
}
