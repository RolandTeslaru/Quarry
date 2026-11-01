import { Foundations } from "../Foundations"
import { Queue } from "./queue"

/** Forge's durable queues (docs/design/durable-queues.md): its messages are added with the change that schedules the work. */
export namespace DurableQueue {

    /** A job's attempt, added when the job becomes `scheduled`; acked when a ForgeAgent starts it, or the build ends first. */
    export const RunJob = Foundations.DurableQueue.define({ queue: Queue.RunJob.Definition })
}
