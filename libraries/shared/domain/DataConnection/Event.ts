import { z } from "zod"
import { Realtime } from "../Realtime/Realtime"
import { Source } from "./Source"
import { SyncRun } from "./SyncRun"

/** Live changes on one source, for whoever can discover it. */
export namespace Event {

    export const Channel = Realtime.Channel.brand("DataConnection.Event.Channel")
    export type  Channel = z.infer<typeof Channel>

    const PREFIX = "data-connection:source:"

    export const getChannel = (sourceRid: Source.Rid) => `${PREFIX}${sourceRid}` as Channel

    /** The source a channel is about, or null if it isn't one of these channels. */
    export const sourceOf = (channel: string): Source.Rid | null => {
        if (!channel.startsWith(PREFIX))
            return null

        const rid = Source.Rid.safeParse(channel.slice(PREFIX.length))

        return rid.success ? rid.data : null
    }

    export const Base = Realtime.Event.Base.extend({
        channel: Channel,
    })
    export type Base = z.infer<typeof Base>

    /** A run started, finished or failed — the run as it is now. */
    export namespace RunUpdated {
        export const Schema = Base.extend({
            type: z.literal("data-connection:run:updated"),
            run:  SyncRun.Schema,
        })
    }
    export type RunUpdated = z.infer<typeof RunUpdated.Schema>

    export const Schema = z.discriminatedUnion("type", [
        RunUpdated.Schema,
    ])

    /** A typed event without its channel — the publisher adds it. */
    export const create = Realtime.Event.defineFactory(Schema)
}
export type Event = z.infer<typeof Event.Schema>
