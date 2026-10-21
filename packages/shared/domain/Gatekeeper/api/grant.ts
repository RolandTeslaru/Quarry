import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource as ResourceD } from "../../Library/Resource"
import { Grant as GrantD } from "../Grant"
import { Role as RoleD } from "../Role"

/** Grants on a resource. Listing needs read; changing needs manage. */
export namespace Grant {

    export namespace List {
        export const Response = z.object({ grants: GrantD.Schema.array() })
        export type  Response = z.infer<typeof Response>
    }

    /** Sets the subject's role on the resource, replacing any previous one. */
    export namespace Put {
        export const Request = z.object({ subject: GrantD.Subject, role: RoleD.Name })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ grant: GrantD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Revoke {
        export const Request = z.object({ subject: GrantD.Subject })
        export type  Request = z.infer<typeof Request>
    }

    export async function list(api: AxiosInstance, rid: ResourceD.Rid): Promise<List.Response> {
        const { data } = await api.get(`/api/resources/${rid}/grants`)
        return List.Response.parse(data)
    }

    export async function put(api: AxiosInstance, rid: ResourceD.Rid, req: Put.Request): Promise<Put.Response> {
        const { data } = await api.put(`/api/resources/${rid}/grants`, req)
        return Put.Response.parse(data)
    }

    export async function revoke(api: AxiosInstance, rid: ResourceD.Rid, req: Revoke.Request): Promise<void> {
        await api.post(`/api/resources/${rid}/grants/revoke`, req)
    }
}
