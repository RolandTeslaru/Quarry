import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource } from "../../Library/Resource"
import { LinkType as LinkTypeD } from "../LinkType"
import { Validation } from "../Validation"

export namespace LinkType {

    /** Its definition: what creating sets and replacing changes. */
    const Definition = LinkTypeD.Schema.pick({
        sides:   true,
        backing: true,
    })

    /** A link type, and the health of what backs it, against its datasets and object types now. */
    const WithMappingHealth = z.object({
        linkType:      LinkTypeD.Schema,
        mappingHealth: Validation.LinkType.MappingHealth,
    })

    /** In the default ontology. With no name, it's named after its object types: `Operative ↔ Equipment`. */
    export namespace Create {
        export const Request = Definition.extend({
            parentRid:   Resource.Rid,
            name:        Resource.Name.nullable().default(null),
            description: z.string().nullable().default(null),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = WithMappingHealth
        export type  Response = z.infer<typeof Response>
    }

    export namespace Get {
        export const Response = WithMappingHealth
        export type  Response = z.infer<typeof Response>
    }

    /** Replaces its sides and backing. */
    export namespace Replace {
        export const Request = Definition
        export type  Request = z.infer<typeof Request>

        export const Response = WithMappingHealth
        export type  Response = z.infer<typeof Response>
    }

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/ontology/link-types", req)
        return Create.Response.parse(data)
    }

    export async function get(api: AxiosInstance, rid: LinkTypeD.Rid): Promise<Get.Response> {
        const { data } = await api.get(`/api/ontology/link-types/${rid}`)
        return Get.Response.parse(data)
    }

    export async function replace(api: AxiosInstance, rid: LinkTypeD.Rid, req: Replace.Request): Promise<Replace.Response> {
        const { data } = await api.put(`/api/ontology/link-types/${rid}`, req)
        return Replace.Response.parse(data)
    }
}
