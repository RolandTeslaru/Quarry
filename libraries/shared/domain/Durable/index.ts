import * as DurableQueueMod from "./Queue"
import * as DurableEventMod from "./Event"
import * as DurableEventListenerMod from "./EventListener"

/** What can't be lost on its way between processes: the outbox and what's built on it (docs/design/durable-queues.md). */
export namespace Durable {
    /** Queues whose messages can't be lost: `Durable.Queue.define({ queue })`. */
    export import Queue = DurableQueueMod.DurableQueue

    /** Facts published for other services, one copy per listener: `Durable.Event.define({ topic, payload })`. */
    export import Event = DurableEventMod.DurableEvent

    /** A service's copy of an event, a durable queue: `Durable.EventListener.define({ event, queue })`. */
    export import EventListener = DurableEventListenerMod.DurableEventListener
}
