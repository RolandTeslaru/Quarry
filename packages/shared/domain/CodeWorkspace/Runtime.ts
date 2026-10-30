import { z } from "zod"
import { Stdio } from "../Stdio/Stdio"
import { CodeTransform } from "../CodeTransform/CodeTransform"
import { ModuleFunctionPath } from "./ModuleFunctionPath"
import { Preview as PreviewD } from "./Preview"

/**
 * What a session's IDE asks of the code-workspace runtime, over Stdio — the
 * runtime it starts inside the session's container. Forge's `run` is the same
 * runtime's, in a job container. See docs/design/forge-runtimes.md, phase 5.
 */
export namespace Runtime {

    /** The workspace's transforms, as the working copy's pipeline declares them. */
    export namespace Describe {
        export const Request = Stdio.Request.Base.extend({
            pattern: z.literal("describe"),
            folder:  z.string(),                     // the working copy, with its .venv
        })
        export type  Request = z.infer<typeof Request>

        export const Response = Stdio.Response.Base.extend({ listing: CodeTransform.Listing })
        export type  Response = z.infer<typeof Response>
    }

    /** One transform as it is in the working copy, on samples of its inputs. One at a time: a new one stops the last. */
    export namespace Preview {
        export const Request = Stdio.Request.Base.extend({
            pattern:   z.literal("preview"),
            folder:    z.string(),
            transform: ModuleFunctionPath.Schema,
            rows:      z.number().int().positive(),
            session:   z.object({
                serverUrl: z.string(),
                token:     z.string(),
            }),
        })
        export type  Request = z.infer<typeof Request>

        /** `result` null: the preview was stopped. */
        export const Response = Stdio.Response.Base.extend({ result: PreviewD.Result.nullable() })
        export type  Response = z.infer<typeof Response>
    }

    /** Stops the running preview, if there is one. */
    export namespace Cancel {
        export const Request = Stdio.Request.Base.extend({ pattern: z.literal("cancel") })
        export type  Request = z.infer<typeof Request>

        export const Response = Stdio.Response.Base
        export type  Response = z.infer<typeof Response>
    }
}
