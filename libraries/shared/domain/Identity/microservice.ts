import { z } from "zod"
import { MicroserviceCall } from "../Foundations/MicroserviceCall"
import { User } from "./User"

/** What Identity (in the main server — it alone mints tokens) serves other services (docs/design/architecture-split.md §8). */
export namespace Microservice {

    /**
     * A token for a user, for work a service does on their behalf outside their request — a sync run
     * acting for whoever pressed run. `via` names the work; the token says it too.
     */
    export namespace MintUserToken {
        export const PATTERN = "identity.mint-user-token"

        export const Request = z.object({ userRid: User.Rid, via: z.string().min(1) })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ token: z.string(), expiresAt: z.coerce.date() })
        export type  Response = z.infer<typeof Response>
    }

    export const Calls = {
        mintUserToken: MintUserToken,
    } satisfies MicroserviceCall.Calls
}
