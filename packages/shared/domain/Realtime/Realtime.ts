import { z } from "zod"

/**
 * Live messages over Redis pub/sub — from PretzelGraph's Realtime. A domain
 * declares its own events (`DataConnection.Event`): a branded channel type, a
 * `getChannel(...)`, and a discriminated union on `type` (`'domain:entity:verb'`).
 *
 * Events go out to subscribers (the browser, through the server's /socket);
 * signals go in to workers. A browser can only subscribe to a channel the server
 * authorizes — each channel names the resource (or user) it's about.
 */
export namespace Realtime {

    export const Channel = z.string().brand("Channel")
    export type  Channel = z.infer<typeof Channel>

    export namespace Event {
        export const Type = z.string()
        export type  Type = z.infer<typeof Type>

        export const Base = z.object({
            channel: Channel,
            type:    Type,
        })

        /** The server refused a subscription: not signed in, an unknown channel, or no access to what it names. */
        export namespace Forbidden {
            export const Schema = Base.extend({
                type:    z.literal("forbidden"),
                message: z.string(),
            })
            export type Schema = z.infer<typeof Schema>
        }
        export type Forbidden = z.infer<typeof Forbidden.Schema>

        /**
         * A domain's typed `create(type, rest)`, from its union (after PretzelGraph's
         * defineEventFactory): `rest` is exactly that member's own fields. The event
         * comes back without its channel — the publisher adds where it goes:
         *
         *   realtime.emitEvent({ ...Forge.Event.create("forge:job:updated", { job }), channel })
         *
         * The schema only drives the types; nothing is parsed.
         */
        export function defineFactory<S extends z.ZodType<z.infer<typeof Base>>>(_schema: S) {

            type Member = z.infer<S>

            type OfType<T extends Member["type"]> = Extract<Member, { type: T }>

            type Rest<T extends Member["type"]> = Omit<OfType<T>, "channel" | "type">

            /** Members with no fields of their own take no second argument. */
            type RestArg<T extends Member["type"]> = {} extends Rest<T> ? [rest?: Rest<T>] : [rest: Rest<T>]

            return function create<T extends Member["type"]>(type: T, ...[rest]: RestArg<T>): Omit<OfType<T>, "channel"> {
                return { ...rest, type } as Omit<OfType<T>, "channel">
            }
        }
    }
    export type Event = z.infer<typeof Event.Base>

    export namespace Signal {
        export const Type = z.string()
        export type  Type = z.infer<typeof Type>

        export const Base = z.object({
            channel: Channel,
            type:    Type,
        })
    }
    export type Signal = z.infer<typeof Signal.Base>

    /** What a browser sends on the socket. */
    export const ClientMessage = z.object({
        action:  z.enum(["subscribe", "unsubscribe"]),
        channel: Channel,
    })
    export type ClientMessage = z.infer<typeof ClientMessage>
}
