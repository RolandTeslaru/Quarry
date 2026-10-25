import { z } from "zod"
import type { AxiosInstance } from "axios"
import { User } from "../../Identity/User"
import { Preview as PreviewD } from "../Preview"
import { Workspace as WorkspaceD } from "../Workspace"

/**
 * The code workspace worker's HTTP API — only the server calls it, with the
 * service token, after its own permission checks. Sessions — the container
 * behind one user's open IDE on one workspace — are the worker's. No credential
 * travels here: the worker fetches a session's token from /internal itself.
 */
export namespace Worker {

    const Session = z.object({
        workspaceRid: WorkspaceD.Rid,
        userRid:      User.Rid,
    })

    /** Start or reuse the session; the IDE's URL. */
    export namespace OpenSession {
        export const Request = Session
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ url: z.url() })
        export type  Response = z.infer<typeof Response>
    }

    /** What the session's working copy declares. */
    export namespace ListTransforms {
        export const Request = Session
        export type  Request = z.infer<typeof Request>

        export const Response = PreviewD.Listing
        export type  Response = z.infer<typeof Response>
    }

    /** One transform of the working copy, on samples of its inputs. */
    export namespace Preview {
        export const Request = Session.extend({
            transform: z.string().min(1),
            rows:      z.number().int().min(1).max(100_000),
        })
        export type Request = z.infer<typeof Request>

        export const Response = PreviewD.Result
        export type  Response = z.infer<typeof Response>
    }

    export async function openSession(worker: AxiosInstance, req: OpenSession.Request, timeout: number): Promise<OpenSession.Response> {
        const { data } = await worker.post("/sessions/open", req, { timeout })
        return OpenSession.Response.parse(data)
    }

    export async function listTransforms(worker: AxiosInstance, req: ListTransforms.Request, timeout: number): Promise<ListTransforms.Response> {
        const { data } = await worker.post("/sessions/transforms", req, { timeout })
        return ListTransforms.Response.parse(data)
    }

    export async function preview(worker: AxiosInstance, req: Preview.Request, timeout: number): Promise<Preview.Response> {
        const { data } = await worker.post("/sessions/preview", req, { timeout })
        return Preview.Response.parse(data)
    }
}
