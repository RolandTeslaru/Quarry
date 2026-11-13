import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource } from "../../Library/Resource"
import { ObjectType as ObjectTypeD } from "../ObjectType"
import { LinkType as LinkTypeD } from "../LinkType"
import { Validation } from "../Validation"

export namespace ObjectType {

    /** Its definition: what creating sets and replacing changes. Name, description and place are the Library's. */
    const Definition = ObjectTypeD.Schema.pick({
        apiName:           true,
        pluralDisplayName: true,
        ui:                true,
        backingDatasetRid: true,
        primaryKey:        true,
        titleProperty:     true,
        properties:        true,
    })

    /** An object type, and each property's mapping health against its backing dataset now. */
    const WithMappingHealth = z.object({
        objectType:    ObjectTypeD.Schema,
        mappingHealth: Validation.ObjectType.MappingHealth,
    })

    /** In the default ontology. */
    export namespace Create {
        export const Request = Definition.extend({
            parentRid:   Resource.Rid,
            name:        Resource.Name,
            description: z.string().nullable().default(null),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = WithMappingHealth
        export type  Response = z.infer<typeof Response>
    }

    /** Every live object type the caller can read, by name — Ontology Studio's home. */
    export namespace List {
        export const Response = z.object({ objectTypes: ObjectTypeD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Get {
        export const Response = WithMappingHealth
        export type  Response = z.infer<typeof Response>
    }

    /** Replaces its definition. */
    export namespace Replace {
        export const Request = Definition
        export type  Request = z.infer<typeof Request>

        export const Response = WithMappingHealth
        export type  Response = z.infer<typeof Response>
    }

    /** Its link types, from either side. */
    export namespace ListLinkTypes {
        export const Response = z.object({ linkTypes: LinkTypeD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/ontology/object-types", req)
        return Create.Response.parse(data)
    }

    export async function list(api: AxiosInstance): Promise<List.Response> {
        const { data } = await api.get("/api/ontology/object-types")
        return List.Response.parse(data)
    }

    export async function get(api: AxiosInstance, rid: ObjectTypeD.Rid): Promise<Get.Response> {
        const { data } = await api.get(`/api/ontology/object-types/${rid}`)
        return Get.Response.parse(data)
    }

    export async function replace(api: AxiosInstance, rid: ObjectTypeD.Rid, req: Replace.Request): Promise<Replace.Response> {
        const { data } = await api.put(`/api/ontology/object-types/${rid}`, req)
        return Replace.Response.parse(data)
    }

    export async function listLinkTypes(api: AxiosInstance, rid: ObjectTypeD.Rid): Promise<ListLinkTypes.Response> {
        const { data } = await api.get(`/api/ontology/object-types/${rid}/link-types`)
        return ListLinkTypes.Response.parse(data)
    }
}
