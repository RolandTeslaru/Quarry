import { describe, expect, it } from "vitest"
import { Build } from "./Build"
import { Event } from "./Event"
import { Job } from "./Job"

describe("Forge.Event", () => {

    it("names a build's channel and reads it back", () => {
        const buildRid = Build.createRid()
        const channel = Event.getChannel(buildRid)

        expect(channel).toBe(`forge:build:${buildRid}`)
        expect(Event.buildOf(channel)).toBe(buildRid)
    })

    it("reads no build from someone else's channel or a malformed one", () => {
        expect(Event.buildOf("data-connection:source:ri.data-connection.main.source.01a1729a-975b-70de-8141-89cca28b34d2")).toBeNull()
        expect(Event.buildOf("forge:build:not-a-rid")).toBeNull()
        expect(Event.buildOf(`forge:build:${Job.createRid()}`)).toBeNull()       // a job's RID isn't a build's
    })

    it("creates an event without its channel — the publisher adds it", () => {
        const job = { rid: Job.createRid() } as Job.Schema
        const event = Event.create("forge:job:updated", { job })

        expect(event).toEqual({ type: "forge:job:updated", job })
        expect("channel" in event).toBe(false)
    })
})
