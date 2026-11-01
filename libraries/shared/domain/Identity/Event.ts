import { z } from "zod"
import { Realtime } from "../Realtime/Realtime"
import { User } from "./User"

/** A user's own channel: messages meant for them wherever they are in the workspace. Only they may subscribe. */
export namespace Event {

    export const Channel = Realtime.Channel.brand("Identity.Event.Channel")
    export type  Channel = z.infer<typeof Channel>

    const PREFIX = "identity:user:"

    export const getChannel = (userRid: User.Rid) => `${PREFIX}${userRid}` as Channel

    /** The user a channel belongs to, or null if it isn't one of these channels. */
    export const userOf = (channel: string): User.Rid | null => {
        if (!channel.startsWith(PREFIX))
            return null

        const rid = User.Rid.safeParse(channel.slice(PREFIX.length))

        return rid.success ? rid.data : null
    }

    export const Base = Realtime.Event.Base.extend({
        channel: Channel,
    })
    export type Base = z.infer<typeof Base>

    /** Something the user should hear about — shown as a toast. */
    export namespace Notification {
        export const Level = z.enum(["success", "info", "warning", "error"])
        export type  Level = z.infer<typeof Level>

        export const Schema = Base.extend({
            type:        z.literal("identity:notification"),
            level:       Level,
            title:       z.string(),
            description: z.string().nullable(),
        })
    }
    export type Notification = z.infer<typeof Notification.Schema>

    export const Schema = z.discriminatedUnion("type", [
        Notification.Schema,
    ])

    /** A typed event without its channel — the publisher adds it. */
    export const create = Realtime.Event.defineFactory(Schema)
}
export type Event = z.infer<typeof Event.Schema>
