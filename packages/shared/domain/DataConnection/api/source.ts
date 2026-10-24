import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource as ResourceD } from "../../Library/Resource"
import { Credential } from "../../Keychain/Credential"
import { Application } from "../../Platform/Application"
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
            outputFolderRid: ResourceD.Rid.nullable().default(null),  // a project or folder its syncs write to; null: its own folder
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

    /** An app opening the source's page: the source, the open recorded (audit). */
    export namespace Open {
        /** Which app opened it — recorded with the open. */
        export const Request = z.object({ application: Application.Id })
        export type  Request = z.infer<typeof Request>

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

    /** A table's first rows, read live from the source (`?limit=`, 100 by default). Needs read on the source and its credential. */
    export namespace PreviewTable {
        export const Query = z.object({ limit: z.coerce.number().int().min(1).max(1000).default(100) })
        export type  Query = z.input<typeof Query>

        export const Response = SourceD.TablePreview
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

    export async function open(api: AxiosInstance, rid: SourceD.Rid, req: Open.Request): Promise<Open.Response> {
        const { data } = await api.post(`/api/sources/${rid}/open`, req)
        return Open.Response.parse(data)
    }

    export async function get(api: AxiosInstance, rid: SourceD.Rid): Promise<Get.Response> {
        const { data } = await api.get(`/api/sources/${rid}`)
        return Get.Response.parse(data)
    }

    export async function test(api: AxiosInstance, rid: SourceD.Rid): Promise<Test.Response> {
        const { data } = await api.post(`/api/sources/${rid}/test`)
        return Test.Response.parse(data)
    }

    export async function previewTable(api: AxiosInstance, rid: SourceD.Rid, table: SourceD.Table, query: PreviewTable.Query = {}): Promise<PreviewTable.Response> {
        const { data } = await api.get(`/api/sources/${rid}/tables/${encodeURIComponent(table.schema)}/${encodeURIComponent(table.name)}/preview`, { params: query })
        return PreviewTable.Response.parse(data)
    }

    export async function explore(api: AxiosInstance, rid: SourceD.Rid): Promise<Explore.Response> {
        const { data } = await api.get(`/api/sources/${rid}/explore`)
        return Explore.Response.parse(data)
    }
}
