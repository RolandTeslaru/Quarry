import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Branch, MAIN_BRANCH } from "../../Foundations/Branch"
import { Dataset as DatasetD } from "../../Dataset/Dataset"
import { Lineage as LineageD } from "../../Library/Lineage"
import { Build as BuildD } from "../Build"
import { Job as JobD } from "../Job"
import { Recipe as RecipeD } from "../Recipe"
import * as AgentMod from "./agent"
import * as RuntimeMod from "./runtime"

/** Forge's HTTP surface for users — mirrors the forge and job http controllers. The agent's and the runtime's are `Agent` and `Runtime`. */
export namespace API {

    /** A build and its jobs, by RID. */
    const BuildWithJobs = z.object({
        build: BuildD.Schema,
        jobs:  z.record(JobD.Rid, JobD.Schema),
    })

    /** Resolves the target into jobs and opens their outputs' transactions; the jobs wait for a runner. */
    export namespace CreateBuild {
        export const Request = z.object({
            branch:           Branch.default(MAIN_BRANCH),
            fallbackBranches: Branch.array().default([]),
            target:           BuildD.Target,
            forceBuild:       z.boolean().default(false),
            onJobFailure:     BuildD.OnJobFailure.default("cancel-descendants"),
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
    export namespace GetCurrentRecipe {
        export const Query = z.object({
            datasetRid: DatasetD.Rid,
            branch:     Branch.default(MAIN_BRANCH),
        })
        export type  Query = z.infer<typeof Query>

        export const Response = z.object({ recipe: RecipeD.Schema.nullable() })
        export type  Response = z.infer<typeof Response>
    }

    /** Whether these datasets are what their recipes would compute now, and how far up each one's nearest stale dataset is. */
    export namespace GetStaleness {
        export const Request = z.object({
            datasetRids: DatasetD.Rid.array().min(1),
            branch:      Branch.default(MAIN_BRANCH),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ staleness: z.record(DatasetD.Rid, LineageD.Staleness.Schema) })
        export type  Response = z.infer<typeof Response>
    }

    export async function createBuild(api: AxiosInstance, req: z.input<typeof CreateBuild.Request>): Promise<CreateBuild.Response> {
        const { data } = await api.post("/api/forge/builds", req)
        return CreateBuild.Response.parse(data)
    }

    export async function listBuilds(api: AxiosInstance, query: z.input<typeof ListBuilds.Query> = {}): Promise<ListBuilds.Response> {
        const { data } = await api.get("/api/forge/builds", { params: query })
        return ListBuilds.Response.parse(data)
    }

    export async function getBuild(api: AxiosInstance, rid: BuildD.Rid): Promise<GetBuild.Response> {
        const { data } = await api.get(`/api/forge/builds/${rid}`)
        return GetBuild.Response.parse(data)
    }

    export async function cancelBuild(api: AxiosInstance, rid: BuildD.Rid): Promise<CancelBuild.Response> {
        const { data } = await api.post(`/api/forge/builds/${rid}/cancel`)
        return CancelBuild.Response.parse(data)
    }

    export async function getJob(api: AxiosInstance, rid: JobD.Rid): Promise<GetJob.Response> {
        const { data } = await api.get(`/api/forge/jobs/${rid}`)
        return GetJob.Response.parse(data)
    }

    export async function getCurrentRecipe(api: AxiosInstance, query: z.input<typeof GetCurrentRecipe.Query>): Promise<GetCurrentRecipe.Response> {
        const { data } = await api.get("/api/forge/recipes/current", { params: query })
        return GetCurrentRecipe.Response.parse(data)
    }

    export async function getStaleness(api: AxiosInstance, req: z.input<typeof GetStaleness.Request>): Promise<GetStaleness.Response> {
        const { data } = await api.post("/api/forge/staleness", req)
        return GetStaleness.Response.parse(data)
    }

    /** ForgeAgents' own endpoints (`/api/forge-agent/…`). */
    export import Agent = AgentMod.Agent

    /** A running job's runtime's endpoints (`/api/forge/jobs/…`, the job's token). */
    export import Runtime = RuntimeMod.Runtime
}
