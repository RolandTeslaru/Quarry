import { z } from "zod"
import type { AxiosInstance } from "axios"
import { User } from "../../Identity/User"
import { Workspace as WorkspaceD } from "../Workspace"

/** Server endpoints only the code workspace worker calls (`/api/internal/…`, service token). */
export namespace Internal {

    /**
     * A session's credential, fetched by the worker each time it acts for one —
     * never sent with the server's request. The server checks the user may still read the
     * workspace, then mints a token that acts as them for a few hours.
     */
    export namespace SessionCredentials {
        export const Request = z.object({
            workspaceRid: WorkspaceD.Rid,
            userRid:      User.Rid,
        })
        export type Request = z.infer<typeof Request>

        export const Response = z.object({
            token: z.string().min(1),
            user:  z.object({ name: z.string(), email: z.email() }),          // the session's git author
        })
        export type Response = z.infer<typeof Response>
    }

    export async function getSessionCredentials(api: AxiosInstance, req: SessionCredentials.Request): Promise<SessionCredentials.Response> {
        const { data } = await api.post("/api/internal/code-workspaces/session-credentials", req)
        return SessionCredentials.Response.parse(data)
    }
}
