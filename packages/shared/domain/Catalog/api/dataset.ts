import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource as ResourceD } from "../../Library/Resource"
import { Dataset as DatasetD } from "../Dataset"

export namespace Dataset {

    /** Creating a dataset = writing into its parent folder. */
    export namespace Create {
        export const Request = z.object({
            parentRid:   ResourceD.Rid,
            name:        ResourceD.Name,
            description: z.string().nullable().default(null),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ dataset: DatasetD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Get {
        export const Response = z.object({ dataset: DatasetD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** The file set at `sequence` (default: latest) on branch main. Needs read. */
    export namespace GetView {
        export const Query = z.object({ sequence: z.coerce.number().int().positive().optional() })
        export type  Query = z.infer<typeof Query>

        export const Response = z.object({ view: DatasetD.View.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/datasets", req)
        return Create.Response.parse(data)
    }

    export async function get(api: AxiosInstance, rid: DatasetD.Rid): Promise<Get.Response> {
        const { data } = await api.get(`/api/datasets/${rid}`)
        return Get.Response.parse(data)
    }

    export async function getView(api: AxiosInstance, rid: DatasetD.Rid, query: GetView.Query = {}): Promise<GetView.Response> {
        const { data } = await api.get(`/api/datasets/${rid}/view`, { params: query })
        return GetView.Response.parse(data)
    }
}
