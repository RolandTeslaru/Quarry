import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Branch } from "../../Foundations/Branch"
import { Dataset as DatasetD } from "../../Catalog/Dataset"
import { Build as BuildD } from "../Build"
import { Job as JobD } from "../Job"
import { JobSpec as JobSpecD } from "../JobSpec"

const MAIN = Branch.parse("main")

/** Forge's HTTP surface — mirrors forge.controller. */
export namespace API {

    /** A build and its jobs, by RID. */
    const BuildWithJobs = z.object({
        build: BuildD.Schema,
        jobs:  z.record(JobD.Rid, JobD.Schema),
    })

    /** Resolves the target into jobs and opens their outputs' transactions; the jobs wait for a runner. */
    export namespace CreateBuild {
        export const Request = z.object({
            branch:           Branch.default(MAIN),
            fallbackBranches: Branch.array().default([]),
            target:           BuildD.Target,
            forceBuild:       z.boolean().default(false),
            abortOnFailure:   z.boolean().default(false),
            retryCount:       z.number().int().nonnegative().default(0),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = BuildWithJobs
        export type  Response = z.infer<typeof Response>
    }

    /** Builds the caller can see, newest first — all of them, or one dataset's. */
    export namespace ListBuilds {
        export const Query = z.object({
            datasetRid: DatasetD.Rid.optional(),
            limit:      z.coerce.number().int().min(1).max(200).default(50),
        })
        export type  Query = z.infer<typeof Query>

        export const Response = z.object({ builds: BuildD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace GetBuild {
        export const Response = BuildWithJobs
        export type  Response = z.infer<typeof Response>
    }

    /** Cancels a running build: unfinished jobs are canceled and their transactions aborted. */
    export namespace CancelBuild {
        export const Response = BuildWithJobs
        export type  Response = z.infer<typeof Response>
    }

    export namespace GetJob {
        export const Response = z.object({ job: JobD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** What computes this dataset on this branch — null if nothing does. */
    export namespace GetCurrentJobSpec {
        export const Query = z.object({
            datasetRid: DatasetD.Rid,
            branch:     Branch.default(MAIN),
        })
        export type  Query = z.infer<typeof Query>

        export const Response = z.object({ jobSpec: JobSpecD.Schema.nullable() })
        export type  Response = z.infer<typeof Response>
    }

    export async function createBuild(api: AxiosInstance, req: z.input<typeof CreateBuild.Request>): Promise<CreateBuild.Response> {
        const { data } = await api.post("/api/builds", req)
        return CreateBuild.Response.parse(data)
    }

    export async function listBuilds(api: AxiosInstance, query: z.input<typeof ListBuilds.Query> = {}): Promise<ListBuilds.Response> {
        const { data } = await api.get("/api/builds", { params: query })
        return ListBuilds.Response.parse(data)
    }

    export async function getBuild(api: AxiosInstance, rid: BuildD.Rid): Promise<GetBuild.Response> {
        const { data } = await api.get(`/api/builds/${rid}`)
        return GetBuild.Response.parse(data)
    }

    export async function cancelBuild(api: AxiosInstance, rid: BuildD.Rid): Promise<CancelBuild.Response> {
        const { data } = await api.post(`/api/builds/${rid}/cancel`)
        return CancelBuild.Response.parse(data)
    }

    export async function getJob(api: AxiosInstance, rid: JobD.Rid): Promise<GetJob.Response> {
        const { data } = await api.get(`/api/jobs/${rid}`)
        return GetJob.Response.parse(data)
    }

    export async function getCurrentJobSpec(api: AxiosInstance, query: z.input<typeof GetCurrentJobSpec.Query>): Promise<GetCurrentJobSpec.Response> {
        const { data } = await api.get("/api/job-specs/current", { params: query })
        return GetCurrentJobSpec.Response.parse(data)
    }
}
