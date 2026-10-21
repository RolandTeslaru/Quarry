import { z } from "zod"
import type { AxiosInstance } from "axios"
import { Folder as FolderD } from "../Folder"
import { Resource as ResourceD } from "../Resource"

export namespace Folder {

    /** Creates a folder inside `parentRid` (a project or folder). */
    export namespace Create {
        export const Request = z.object({
            name:        ResourceD.Name,
            description: z.string().nullable().default(null),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ folder: FolderD.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export async function create(api: AxiosInstance, parentRid: ResourceD.Rid, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post(`/api/resources/${parentRid}/folders`, req)
        return Create.Response.parse(data)
    }
}
