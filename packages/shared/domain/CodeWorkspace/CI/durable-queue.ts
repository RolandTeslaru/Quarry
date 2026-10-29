import { Foundations } from "../../Foundations"
import { Queue } from "./queue"

/** CI's durable queues (docs/design/durable-queues.md). */
export namespace DurableQueue {

    /** A check run, added when it's scheduled (its workspace free); acked when a worker starts it, or a newer push cancels it. */
    export const RunCheck = Foundations.DurableQueue.define({ queue: Queue.RunCheck.Definition })
}
