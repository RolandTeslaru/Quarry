import { z } from "zod"
import { Foundations } from "../../Foundations"
import { CheckRun as CheckRunD } from "./CheckRun"

/** CI's background-job contracts. docs/design/code-workspaces/checks.md §3. */
export namespace Queue {

    /**
     * Run one scheduled check run — delivered through the durable queue (CodeWorkspace.CI.DurableQueue.RunCheck),
     * consumed by the code workspace worker (its concurrency is its slots). The BullMQ job id is the run's
     * RID: sending it again while it waits is ignored.
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
     * Every minute, from the system worker: the server fails runs whose worker went silent, and
     * schedules what's waiting. (Resending lost messages is the durable-queue sweep's.)
     */
    export namespace CheckSweep {
        export const Result = z.object({
            failed:    z.number().int(),
            scheduled: z.number().int(),
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
