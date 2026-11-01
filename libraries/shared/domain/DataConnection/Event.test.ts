import { describe, expect, it } from "vitest"
import { Event } from "./Event"
import { Source } from "./Source"
import { Sync } from "./Sync"
import { SyncRun } from "./SyncRun"

describe("DataConnection.Event", () => {

    it("names a source's channel and reads it back", () => {
        const sourceRid = Source.createRid()
        const channel = Event.getChannel(sourceRid)

        expect(channel).toBe(`data-connection:source:${sourceRid}`)
        expect(Event.sourceOf(channel)).toBe(sourceRid)
    })

    it("reads no source from someone else's channel or a malformed one", () => {
        expect(Event.sourceOf("forge:build:ri.forge.main.build.01a1729a-975b-70de-8141-89cca28b34d2")).toBeNull()
        expect(Event.sourceOf("data-connection:source:not-a-rid")).toBeNull()
        expect(Event.sourceOf(`data-connection:source:${Sync.createRid()}`)).toBeNull()      // a sync's RID isn't a source's
    })

    it("creates an event without its channel — the publisher adds it", () => {
        const run = { rid: SyncRun.createRid() } as SyncRun.Schema
        const event = Event.create("data-connection:run:updated", { run })

        expect(event).toEqual({ type: "data-connection:run:updated", run })
        expect("channel" in event).toBe(false)
    })
})
