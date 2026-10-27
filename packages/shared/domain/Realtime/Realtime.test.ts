import { z } from "zod"
import { describe, expect, it } from "vitest"
import { Realtime } from "./Realtime"

const Channel = Realtime.Channel.brand("Test.Channel")

const Schema = z.discriminatedUnion("type", [
    Realtime.Event.Base.extend({ channel: Channel, type: z.literal("test:ping") }),
    Realtime.Event.Base.extend({ channel: Channel, type: z.literal("test:moved"), from: z.number(), to: z.number() }),
])

describe("Realtime.Event.defineFactory", () => {

    const create = Realtime.Event.defineFactory(Schema)

    it("builds a member from its own fields, without a channel", () => {
        expect(create("test:moved", { from: 1, to: 2 })).toEqual({ type: "test:moved", from: 1, to: 2 })
    })

    it("takes no second argument for a member with no fields of its own", () => {
        expect(create("test:ping")).toEqual({ type: "test:ping" })
    })

    it("gives a complete event once the publisher adds the channel", () => {
        const event = { ...create("test:moved", { from: 1, to: 2 }), channel: "test:a" }

        expect(Schema.safeParse(event).success).toBe(true)
    })
})
