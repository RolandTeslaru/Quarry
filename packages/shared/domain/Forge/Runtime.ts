import { z } from "zod"
import { Stdio } from "../Stdio/Stdio"
import { Job } from "./Job"
import { Recipe } from "./Recipe"

/**
 * What Forge asks of a runtime, over Stdio. Every application's runtime answers
 * these; `Forge.Recipe.Runtime` says which runtime a recipe uses. See
 * docs/design/forge-runtimes.md.
 */
export namespace Runtime {

    /** Run one job. */
    export namespace Run {
        export const Request = Stdio.Request.Base.extend({
            pattern: z.literal("run"),
            job:     Job.Schema,
            recipe:  Recipe.Schema,
            token:   z.string(),          // the runtime's to use, never its children's
        })
        export type  Request = z.infer<typeof Request>

        export const Response = Stdio.Response.Base.extend({
            status:  z.enum(["succeeded", "failed"]),
            failure: z.object({ message: z.string() }).nullable(),
        })
        export type  Response = z.infer<typeof Response>
    }
}
