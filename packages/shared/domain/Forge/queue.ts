import { z } from "zod"
import { Foundations } from "../Foundations"
import { Job as JobD } from "./Job"

/**
 * Forge's background-job contracts. The server's relay produces; ForgeAgents
 * consume. See docs/design/forge.md §2.
 */
export namespace Queue {

    /** Run one attempt of one job. The BullMQ job id is `<rid>_<attempt>`, so a repeated push is ignored. */
    export namespace RunJob {
        export const Job = z.object({
            jobRid:  JobD.Rid,
            attempt: z.number().int().positive(),
        })
        export type  Job = z.infer<typeof Job>

        export const Result = z.object({ status: z.enum(["succeeded", "failed", "skipped"]) })
        export type  Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "forge.run-job",
            job:     Job,
            result:  Result,
            options: { removeOnComplete: 1000, removeOnFail: 1000 },
        })

        export const getJobId = (job: Job): string => `${job.jobRid}_${job.attempt}`
    }

    /**
     * Re-sends jobs the relay's fast path didn't deliver: scheduled ones, and ones
     * queued long ago that no ForgeAgent started (Redis has no persistence, so a
     * restart loses them). Singleton, system worker, every minute.
     */
    export namespace RelaySweep {
        export const Result = z.object({ relayed: z.number().int() })
        export type  Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "forge.relay-sweep",
            job:     z.object({}),
            result:  Result,
            options: { removeOnComplete: 50, removeOnFail: 50 },
        })
    }
}
