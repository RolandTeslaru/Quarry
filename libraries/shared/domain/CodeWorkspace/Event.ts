import { z } from "zod"
import { Realtime } from "../Realtime/Realtime"
import { Workspace } from "./Workspace"
import { CheckRun } from "./CI/CheckRun"

/** Live changes in one Code Workspace, for whoever can read it. */
export namespace Event {

    export const Channel = Realtime.Channel.brand("CodeWorkspace.Event.Channel")
    export type  Channel = z.infer<typeof Channel>

    const PREFIX = "code-workspace:workspace:"

    export const getChannel = (workspaceRid: Workspace.Rid) => `${PREFIX}${workspaceRid}` as Channel

    /** The workspace a channel is about, or null if it isn't one of these channels. */
    export const workspaceOf = (channel: string): Workspace.Rid | null => {
        if (!channel.startsWith(PREFIX))
            return null

        const rid = Workspace.Rid.safeParse(channel.slice(PREFIX.length))

        return rid.success ? rid.data : null
    }

    export const Base = Realtime.Event.Base.extend({
        channel: Channel,
    })
    export type Base = z.infer<typeof Base>

    /** Any change to a check run — queued, scheduled, started, a step, finished, canceled: the run as it is now. */
    export namespace CheckRunUpdated {
        export const Schema = Base.extend({
            type:     z.literal("code-workspace:check-run:updated"),
            checkRun: CheckRun.Schema,
        })
    }
    export type CheckRunUpdated = z.infer<typeof CheckRunUpdated.Schema>

    export const Schema = z.discriminatedUnion("type", [
        CheckRunUpdated.Schema,
    ])

    /** A typed event without its channel — the publisher adds it. */
    export const create = Realtime.Event.defineFactory(Schema)

    /** A check run changed: the event, on its workspace's channel. */
    export const checkRunUpdated = (checkRun: CheckRun.Schema): CheckRunUpdated => ({
        ...create("code-workspace:check-run:updated", { checkRun }),
        channel: getChannel(checkRun.workspaceRid),
    })
}
export type Event = z.infer<typeof Event.Schema>
