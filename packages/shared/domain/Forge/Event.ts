import { z } from "zod"
import { Realtime } from "../Realtime/Realtime"
import { Build } from "./Build"
import { Job as JobD } from "./Job"

/** Live changes on one build, for whoever can see it (discover on one of its targets). */
export namespace Event {

    export const Channel = Realtime.Channel.brand("Forge.Event.Channel")
    export type  Channel = z.infer<typeof Channel>

    const PREFIX = "forge:build:"

    export const getChannel = (buildRid: Build.Rid) => `${PREFIX}${buildRid}` as Channel

    /** The build a channel is about, or null if it isn't one of these channels. */
    export const buildOf = (channel: string): Build.Rid | null => {
        if (!channel.startsWith(PREFIX))
            return null

        const rid = Build.Rid.safeParse(channel.slice(PREFIX.length))

        return rid.success ? rid.data : null
    }

    export const Base = Realtime.Event.Base.extend({
        channel: Channel,
    })
    export type Base = z.infer<typeof Base>

    export namespace Job {

        /** Any change to a job — scheduled, queued, started, finished, canceled: the job as it is now. */
        export namespace Updated {
            export const Schema = Base.extend({
                type: z.literal("forge:job:updated"),
                job:  JobD.Schema,
            })
        }
        export type Updated = z.infer<typeof Updated.Schema>
    }

    export const Schema = z.discriminatedUnion("type", [
        Job.Updated.Schema,
    ])

    /** `create("forge:job:updated", { job })` — without its channel; the publisher adds it. */
    export const create = Realtime.Event.defineFactory(Schema)
}
export type Event = z.infer<typeof Event.Schema>
