import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Branch, MAIN_BRANCH } from "../../Foundations/Branch"
import { Dataset as DatasetD } from "../../Dataset/Dataset"
import { Build as BuildD } from "../Build"
import { Job as JobD } from "../Job"
import { Recipe as RecipeD } from "../Recipe"
import * as AgentMod from "./agent"

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
            branch:           Branch.default(MAIN_BRANCH),
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
    export namespace GetCurrentRecipe {
        export const Query = z.object({
            datasetRid: DatasetD.Rid,
            branch:     Branch.default(MAIN_BRANCH),
        })
        export type  Query = z.infer<typeof Query>

        export const Response = z.object({ recipe: RecipeD.Schema.nullable() })
        export type  Response = z.infer<typeof Response>
    }

    /** The running job's pinned inputs, each as read passes — for its runtime, with the job's token. */
    export namespace GetInputPasses {
        export const Response = z.object({ inputs: z.record(DatasetD.Rid, DatasetD.ReadPasses.Schema) })
        export type  Response = z.infer<typeof Response>
    }

    /** A file of a job's output, as its runtime names it: plain, and Parquet. */
    export const OutputFilename = z.string().regex(/^[A-Za-z0-9._-]+\.parquet$/, "a file name like part-0.parquet")

    /** Where the running job's runtime uploads one file of an output: a URL that PUTs it, without credentials. */
    export namespace CreateUploadPass {
        export const Request = z.object({ filename: OutputFilename })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ url: z.string() })
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

    export async function getCurrentRecipe(api: AxiosInstance, query: z.input<typeof GetCurrentRecipe.Query>): Promise<GetCurrentRecipe.Response> {
        const { data } = await api.get("/api/recipes/current", { params: query })
        return GetCurrentRecipe.Response.parse(data)
    }

    export async function getInputPasses(api: AxiosInstance, rid: JobD.Rid): Promise<GetInputPasses.Response> {
        const { data } = await api.get(`/api/jobs/${rid}/input-passes`)
        return GetInputPasses.Response.parse(data)
    }

    export async function createUploadPass(
        api:        AxiosInstance,
        rid:        JobD.Rid,
        datasetRid: DatasetD.Rid,
        req:        CreateUploadPass.Request,
    ): Promise<CreateUploadPass.Response> {
        const { data } = await api.post(`/api/jobs/${rid}/outputs/${datasetRid}/upload-passes`, req)
        return CreateUploadPass.Response.parse(data)
    }

    export async function registerOutputFile(api: AxiosInstance, rid: JobD.Rid, datasetRid: DatasetD.Rid, req: RegisterOutputFile.Request): Promise<void> {
        await api.post(`/api/jobs/${rid}/outputs/${datasetRid}/files`, req)
    }

    /** ForgeAgents' own endpoints (`/api/forge-agent/…`). */
    export import Agent = AgentMod.Agent
}
