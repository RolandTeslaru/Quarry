import { z } from "zod"
import { Foundations } from "../../Foundations"
import { User } from "../../Identity/User"
import { Preview } from "../Preview"
import { Workspace } from "../Workspace"

/**
 * Code Workspaces' background-job contracts. Sessions — the container behind one
 * user's open IDE on one workspace — are the code workspace worker's; the server asks it over
 * this queue, request–reply, after its own permission checks. No credential
 * travels here: the worker fetches a session's token from /internal itself.
 */
export namespace Queue {

    export namespace Session {
        const Base = z.object({
            workspaceRid: Workspace.Rid,
            userRid:      User.Rid,
        })

        export const Job = z.discriminatedUnion("op", [
            Base.extend({ op: z.literal("open") }),                                         // start or reuse; the IDE's URL
            Base.extend({ op: z.literal("transforms") }),                                   // what the working copy declares
            Base.extend({ op: z.literal("preview"), transform: z.string().min(1), rows: z.number().int().min(1).max(100_000) }),
        ])
        export type Job = z.infer<typeof Job>

        export const Result = z.discriminatedUnion("op", [
            z.object({ op: z.literal("open"), url: z.url() }),
            z.object({ op: z.literal("transforms"), result: Preview.Listing }),
            z.object({ op: z.literal("preview"), result: Preview.Result }),
        ])
        export type Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "code-workspace.session",
            job:     Job,
            result:  Result,
            options: { attempts: 1, removeOnComplete: { age: 60 }, removeOnFail: { age: 600 } },
        })
    }
}
