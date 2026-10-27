import { z } from "zod"
import type { AxiosInstance } from "axios"
import { User } from "../../Identity/User"
import { Workspace as WorkspaceD } from "../Workspace"

/**
 * The code workspace worker's HTTP API — only the server calls it, with the
 * service token, after its own permission checks. Sessions — the container
 * behind one user's open IDE on one workspace — are the worker's. No credential
 * travels here: the worker fetches a session's token from /internal itself.
 * (Previews don't come through here: the Quarry extension runs them in the session.)
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

    /** Replace the session's container with a fresh one from the current runtime image, keeping its volume; the IDE's URL. */
    export namespace RestartSession {
        export const Request = Session
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ url: z.url() })
        export type  Response = z.infer<typeof Response>
    }

    export async function openSession(worker: AxiosInstance, req: OpenSession.Request, timeout: number): Promise<OpenSession.Response> {
        const { data } = await worker.post("/sessions/open", req, { timeout })
        return OpenSession.Response.parse(data)
    }

    export async function restartSession(worker: AxiosInstance, req: RestartSession.Request, timeout: number): Promise<RestartSession.Response> {
        const { data } = await worker.post("/sessions/restart", req, { timeout })
        return RestartSession.Response.parse(data)
    }
}
