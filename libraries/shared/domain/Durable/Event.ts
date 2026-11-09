import { z } from "zod"

/**
 * A fact one service publishes for others to act on, which can't be lost: published in the
 * transaction that makes it true, as one outbox message per listener (durable.event_listener),
 * each kept until that listener acks it. Defined by the service that publishes it.
 * docs/design/durable-queues.md.
 */
export namespace DurableEvent {

    /** What happened, as Realtime's event types: `<domain>:<entity>:<verb>`, kebab-case — 'forge:job:succeeded'. */
    export const Topic = z.string()
        .regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, "Topics are <domain>:<entity>:<verb>, kebab-case")
        .brand("Durable.Event.Topic")
    export type  Topic = z.infer<typeof Topic>

    export interface Definition<P extends z.ZodType = z.ZodType> {
        readonly topic:   Topic
        readonly payload: P
    }

    /** Declares an event. Throws at module load on a malformed topic. */
    export const define = <P extends z.ZodType>(definition: { topic: string; payload: P }): Definition<P> =>
        ({ ...definition, topic: Topic.parse(definition.topic) })

    export type PayloadOf<E extends Definition> = z.output<E["payload"]>
    export type InputOf<E extends Definition>   = z.input<E["payload"]>
}
