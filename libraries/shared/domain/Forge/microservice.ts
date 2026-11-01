import { z } from "zod"
import { MicroserviceCall } from "../Foundations/MicroserviceCall"
import { Build } from "./Build"
import { API } from "./api"

/** What the Forge service serves other services (docs/design/architecture-split.md §8). */
export namespace Microservice {

    /** The build and its jobs, as the user sees them (RLS) — the realtime gateway's check on a build's channel. */
    export namespace GetBuild {
        export const PATTERN = "forge.get-build"

        export const Request = z.object({ rid: Build.Rid })
        export type  Request = z.infer<typeof Request>

        export const Response = API.GetBuild.Response
        export type  Response = z.infer<typeof Response>
    }

    export const Calls = {
        getBuild: GetBuild,
    } satisfies MicroserviceCall.Calls
}
