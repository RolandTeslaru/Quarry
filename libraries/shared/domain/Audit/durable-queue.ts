import { Foundations } from "../Foundations"
import { Queue } from "./queue"

/** Audit's durable queues (docs/design/durable-queues.md). */
export namespace DurableQueue {

    /** An access record, added where the access happened; acked when the main server stores it. */
    export const Record = Foundations.DurableQueue.define({ queue: Queue.Record.Definition })
}
