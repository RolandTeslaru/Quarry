import { z } from "zod"
import { Queue } from "../Foundations/Queue"
import { DurableQueue } from "./Queue"
import { DurableEvent } from "./Event"

/**
 * One service listening to a durable event: a durable queue whose messages are the event's
 * payload. Registered by the listener's migration — a `(topic, queue_name)` row in
 * durable.event_listener — and defined beside it by the listener, under its own namespace.
 * The listener's processor takes each message and acks it, as for any durable queue.
 *
 * Its options are the same for every listener, so a listener's queue follows from the event and
 * the queue name alone: the publisher relays the messages it just added without knowing who listens.
 */
export namespace DurableEventListener {

    export const Result = z.object({})

    export const QUEUE_OPTIONS: Queue.Options = { removeOnComplete: 1000, removeOnFail: 1000 }

    export interface Definition<E extends DurableEvent.Definition = DurableEvent.Definition>
        extends DurableQueue.Definition<Queue.Definition<E["payload"], typeof Result>> {
        readonly event: E
    }

    /** `queue` is the name in the listener's durable.event_listener row: `<listener service>.<name>`. */
    export const define = <E extends DurableEvent.Definition>(options: { event: E; queue: string }): Definition<E> => ({
        ...DurableQueue.define({
            queue: Queue.define({ name: options.queue, job: options.event.payload, result: Result, options: QUEUE_OPTIONS }),
        }),
        event: options.event,
    })
}
