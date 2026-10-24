import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource as ResourceD } from "../../Library/Resource"
import { Credential as CredentialD } from "../Credential"

export namespace Credential {

    /** Every credential template the deployment's integrations declare, with its form (JSON Schema) — by id. */
    export namespace ListTemplates {
        export const Response = z.object({ templates: z.record(CredentialD.Template.Id, CredentialD.Template.Schema) })   // by id
        export type  Response = z.infer<typeof Response>
    }

    /** Credentials the caller can discover, across projects — optionally of one template (a source form's picker). */
    export namespace List {
        export const Request = z.object({ templateId: CredentialD.Template.Id.optional() })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ credentials: CredentialD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Create {
        export const Request = z.object({
            parentRid:   ResourceD.Rid,
            name:        ResourceD.Name,
            description: z.string().nullable().default(null),
            templateId:  CredentialD.Template.Id,
            values:      CredentialD.Values,                  // validated by the server against the template's Fields
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ credential: CredentialD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Get {
        export const Response = z.object({ credential: CredentialD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    /** Replaces every value — the form sends them all, as reveal returned them. */
    export namespace UpdateValues {
        export const Request = z.object({ values: CredentialD.Values })
        export type  Request = z.infer<typeof Request>
    }

    /** Editors and owners only. */
    export namespace Reveal {
        export const Response = z.object({ values: CredentialD.Values })
        export type  Response = z.infer<typeof Response>
    }

    export async function listTemplates(api: AxiosInstance): Promise<ListTemplates.Response> {
        const { data } = await api.get("/api/keychain/templates")
        return ListTemplates.Response.parse(data)
    }

    export async function list(api: AxiosInstance, req: List.Request = {}): Promise<List.Response> {
        const { data } = await api.get("/api/keychain/credentials", { params: req })
        return List.Response.parse(data)
    }

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/keychain/credentials", req)
        return Create.Response.parse(data)
    }

    export async function get(api: AxiosInstance, rid: CredentialD.Rid): Promise<Get.Response> {
        const { data } = await api.get(`/api/keychain/credentials/${rid}`)
        return Get.Response.parse(data)
    }

    export async function updateValues(api: AxiosInstance, rid: CredentialD.Rid, req: UpdateValues.Request): Promise<void> {
        await api.put(`/api/keychain/credentials/${rid}/values`, req)
    }

    export async function reveal(api: AxiosInstance, rid: CredentialD.Rid): Promise<Reveal.Response> {
        const { data } = await api.post(`/api/keychain/credentials/${rid}/reveal`)
        return Reveal.Response.parse(data)
    }
}
