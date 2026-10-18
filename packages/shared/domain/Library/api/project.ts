import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Project as ProjectD } from "../Project"
import { Resource as ResourceD } from "../Resource"

export namespace Project {

    export namespace List {
        export const Response = z.object({ projects: ResourceD.Base.array() })
        export type  Response = z.infer<typeof Response>
    }

    /** Workspace admins only — projects are roots, so there's no parent to gate on. */
    export namespace Create {
        export const Request = z.object({
            name:        ResourceD.Name,
            description: z.string().nullable().default(null),
        })
        export type  Request = z.input<typeof Request>

        export const Response = z.object({ project: ProjectD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export async function list(api: AxiosInstance): Promise<List.Response> {
        const { data } = await api.get("/api/projects")
        return List.Response.parse(data)
    }

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/projects", req)
        return Create.Response.parse(data)
    }
}
