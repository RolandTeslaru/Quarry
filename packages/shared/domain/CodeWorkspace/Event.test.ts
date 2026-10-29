import { describe, expect, it } from "vitest"
import { Event } from "./Event"
import { CheckRun } from "./CI/CheckRun"
import { Workspace } from "./Workspace"

describe("CodeWorkspace.Event", () => {

    it("names a workspace's channel and reads it back", () => {
        const workspaceRid = Workspace.createRid()
        const channel = Event.getChannel(workspaceRid)

        expect(channel).toBe(`code-workspace:workspace:${workspaceRid}`)
        expect(Event.workspaceOf(channel)).toBe(workspaceRid)
    })

    it("reads no workspace from someone else's channel or a malformed one", () => {
        expect(Event.workspaceOf("forge:build:ri.forge.main.build.01a1729a-975b-70de-8141-89cca28b34d2")).toBeNull()
        expect(Event.workspaceOf("code-workspace:workspace:not-a-rid")).toBeNull()
        expect(Event.workspaceOf(`code-workspace:workspace:${CheckRun.createRid()}`)).toBeNull()     // a check run's RID isn't a workspace's
    })

    it("creates an event without its channel — the publisher adds it", () => {
        const checkRun = { rid: CheckRun.createRid() } as CheckRun.Schema
        const event = Event.create("code-workspace:check-run:updated", { checkRun })

        expect(event).toEqual({ type: "code-workspace:check-run:updated", checkRun })
        expect("channel" in event).toBe(false)
    })
})
