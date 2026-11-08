import * as DurableQueueMod from "./Queue"

/** What can't be lost on its way between processes: the outbox and what's built on it (docs/design/durable-queues.md). */
export namespace Durable {
    /** Queues whose messages can't be lost: `Durable.Queue.define({ queue })`. */
    export import Queue = DurableQueueMod.DurableQueue
}
