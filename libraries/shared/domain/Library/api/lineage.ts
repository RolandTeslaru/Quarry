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

        export const Response = z.object({ graph: LineageD.Graph.Schema })
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
}
