import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Foundations } from "../../Foundations"
import { Resource } from "../Resource"
import { Lineage as LineageD } from "../Lineage"

/** Reading a resource's lineage, in either direction. */
export namespace Lineage {

    export namespace Get {
        export const Request = z.object({
            branch:         Foundations.Branch.default(Foundations.MAIN_BRANCH),
            depth:          z.coerce.number().int().min(1).max(LineageD.Walk.MAX_DEPTH).default(LineageD.Walk.ONE_HOP.depth),
            includeTrashed: z.stringbool().default(LineageD.Walk.ONE_HOP.includeTrashed),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = LineageD.Graph.Schema
        export type  Response = z.infer<typeof Response>
    }

    /** Some resources, and the edges among them — what's on a canvas. */
    export namespace GetGraph {
        export const Request = z.object({
            rids:   Resource.Rid.array(),
            branch: Foundations.Branch.default(Foundations.MAIN_BRANCH),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = Get.Response
        export type  Response = z.infer<typeof Response>
    }

    /** The branches lineage can be read on: main, and every branch with an edge the caller can see. */
    export namespace GetBranches {
        export const Response = z.object({ branches: Foundations.Branch.array() })
        export type  Response = z.infer<typeof Response>
    }

    export async function getUpstream(api: AxiosInstance, rid: Resource.Rid, req: Get.Request): Promise<Get.Response> {
        const { data } = await api.get(`/api/resources/${rid}/lineage/upstream`, { params: req })
        return Get.Response.parse(data)
    }

    export async function getDownstream(api: AxiosInstance, rid: Resource.Rid, req: Get.Request): Promise<Get.Response> {
        const { data } = await api.get(`/api/resources/${rid}/lineage/downstream`, { params: req })
        return Get.Response.parse(data)
    }

    export async function getGraph(api: AxiosInstance, req: GetGraph.Request): Promise<GetGraph.Response> {
        const { data } = await api.post("/api/resources/lineage/graph", req)
        return GetGraph.Response.parse(data)
    }

    export async function getBranches(api: AxiosInstance): Promise<GetBranches.Response> {
        const { data } = await api.get("/api/resources/lineage/branches")
        return GetBranches.Response.parse(data)
    }
}
