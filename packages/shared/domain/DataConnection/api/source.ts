import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource as ResourceD } from "../../Library/Resource"
import { Credential } from "../../Keychain/Credential"
import { Source as SourceD } from "../Source"

export namespace Source {

    export namespace Create {
        export const Request = z.object({
            parentRid:   ResourceD.Rid,
            name:        ResourceD.Name,
            description:  z.string().nullable().default(null),
            definitionId: SourceD.DefinitionId,
            config:       SourceD.Config,                  // validated by the server against the definition
            credentialRid: Credential.Rid.nullable().default(null),   // of the definition's template; needs read on it
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ source: SourceD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** The source types this deployment supports, with their config forms (JSON Schema) — by id. */
    export namespace ListDefinitions {
        export const Response = z.object({ definitions: z.record(SourceD.DefinitionId, SourceD.Definition.Schema) })
        export type  Response = z.infer<typeof Response>
    }

    /** Every live source the caller can discover, across projects — Data Connection's home. */
    export namespace List {
        export const Response = z.object({ sources: SourceD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Get {
        export const Response = z.object({ source: SourceD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** Runs in the Data Connection worker, which decrypts the credential — the server sends it encrypted. */
    export namespace Test {
        export const Response = z.object({ ok: z.boolean(), error: z.string().nullable() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Explore {
        export const Response = z.object({ tables: SourceD.Table.array() })
        export type  Response = z.infer<typeof Response>
    }

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/sources", req)
        return Create.Response.parse(data)
    }

    export async function listDefinitions(api: AxiosInstance): Promise<ListDefinitions.Response> {
        const { data } = await api.get("/api/sources/definitions")
        return ListDefinitions.Response.parse(data)
    }

    export async function list(api: AxiosInstance): Promise<List.Response> {
        const { data } = await api.get("/api/sources")
        return List.Response.parse(data)
    }

    export async function get(api: AxiosInstance, rid: SourceD.Rid): Promise<Get.Response> {
        const { data } = await api.get(`/api/sources/${rid}`)
        return Get.Response.parse(data)
    }

    export async function test(api: AxiosInstance, rid: SourceD.Rid): Promise<Test.Response> {
        const { data } = await api.post(`/api/sources/${rid}/test`)
        return Test.Response.parse(data)
    }

    export async function explore(api: AxiosInstance, rid: SourceD.Rid): Promise<Explore.Response> {
        const { data } = await api.get(`/api/sources/${rid}/explore`)
        return Explore.Response.parse(data)
    }
}
