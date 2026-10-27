import { z } from "zod"
import { Foundations } from "../Foundations"
import { CheckRun as CheckRunD } from "./CheckRun"

/** Code Workspaces' background-job contracts. docs/design/code-workspaces/checks.md §3. */
export namespace Queue {

    /**
     * Run one claimed check run — produced by the server's dispatch, consumed by the code
     * workspace worker (its concurrency is its slots). The BullMQ job id is the run's RID:
     * sending it again while the message waits is ignored. A run is claimed again only after
     * its enqueue failed (no message), and messages are removed when done — so the id is free
     * whenever a message is really missing.
     */
    export namespace RunCheck {
        export const Job = z.object({ checkRunRid: CheckRunD.Rid })
        export type  Job = z.infer<typeof Job>

        export const Result = z.object({ status: z.enum(["succeeded", "failed", "skipped"]) })
        export type  Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "code-workspace.run-check",
            job:     Job,
            result:  Result,
            options: { removeOnComplete: true, removeOnFail: true },
        })

        export const getJobId = (run: Pick<CheckRunD.Schema, "rid">): string => run.rid
    }

    /**
     * Every minute, from the system worker: the server sends again check runs no worker
     * took (Redis may have lost them), fails ones whose worker went silent, and dispatches what's queued.
     */
    export namespace CheckSweep {
        export const Result = z.object({
            resent:     z.number().int(),
            failed:     z.number().int(),
            dispatched: z.number().int(),
        })
        export type  Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "code-workspace.check-sweep",
            job:     z.object({}),
            result:  Result,
            options: { removeOnComplete: 50, removeOnFail: 50 },
        })
    }
}
