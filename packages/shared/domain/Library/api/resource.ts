import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Resource as ResourceD } from "../Resource"
import { Application } from "../../Platform/Application"

/** Operations that work on any library resource, whatever its type. */
export namespace Resource {

    export namespace Get {
        export const Response = z.object({ resource: ResourceD.Base })
        export type  Response = z.infer<typeof Response>
    }

    /** An app opening the resource's page (a project or folder in the Library): it, the open recorded (audit). */
    export namespace Open {
        /** Which app opened it — recorded with the open. */
        export const Request = z.object({ application: Application.Id })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ resource: ResourceD.Base })
        export type  Response = z.infer<typeof Response>
    }

    /** Root first, the resource itself last. */
    export namespace Path {
        export const Response = z.object({ path: ResourceD.Base.array() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Children {
        export const Response = z.object({ children: ResourceD.Base.array() })
        export type  Response = z.infer<typeof Response>
    }

    export namespace Rename {
        export const Request = z.object({ name: ResourceD.Name })
        export type  Request = z.infer<typeof Request>
    }

    export namespace Move {
        export const Request = z.object({ parentRid: ResourceD.Rid })
        export type  Request = z.infer<typeof Request>
    }

    export async function get(api: AxiosInstance, rid: ResourceD.Rid): Promise<Get.Response> {
        const { data } = await api.get(`/api/resources/${rid}`)
        return Get.Response.parse(data)
    }

    export async function open(api: AxiosInstance, rid: ResourceD.Rid, req: Open.Request): Promise<Open.Response> {
        const { data } = await api.post(`/api/resources/${rid}/open`, req)
        return Open.Response.parse(data)
    }

    export async function path(api: AxiosInstance, rid: ResourceD.Rid): Promise<Path.Response> {
        const { data } = await api.get(`/api/resources/${rid}/path`)
        return Path.Response.parse(data)
    }

    export async function children(api: AxiosInstance, rid: ResourceD.Rid): Promise<Children.Response> {
        const { data } = await api.get(`/api/resources/${rid}/children`)
        return Children.Response.parse(data)
    }

    export async function rename(api: AxiosInstance, rid: ResourceD.Rid, req: Rename.Request): Promise<void> {
        await api.patch(`/api/resources/${rid}/name`, req)
    }

    export async function move(api: AxiosInstance, rid: ResourceD.Rid, req: Move.Request): Promise<void> {
        await api.post(`/api/resources/${rid}/move`, req)
    }

    export async function trash(api: AxiosInstance, rid: ResourceD.Rid): Promise<void> {
        await api.post(`/api/resources/${rid}/trash`)
    }
}
