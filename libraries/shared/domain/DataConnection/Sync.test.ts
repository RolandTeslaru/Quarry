import { describe, expect, it } from "vitest"
import { Queue } from "./queue"
import { Sync } from "./Sync"

describe("DataConnection.Sync", () => {

    it.each(["0 3 * * *", "*/15 * * * *", "0 0 1 1 0"])("accepts the five-field cron %s", (cron) => {
        expect(Sync.Schedule.parse(cron)).toBe(cron)
    })

    it("accepts no schedule — manual only", () => {
        expect(Sync.Schedule.parse(null)).toBeNull()
    })

    it.each(["", "0 3 * *", "0 3 * * * *", "@daily", "every day"])("refuses %j: not five fields", (cron) => {
        expect(Sync.Schedule.safeParse(cron).success).toBe(false)
    })
})

describe("DataConnection.Queue.Sync", () => {

    it("deduplicates runs per sync: the same id for the same sync, another for another", () => {
        const sync = Sync.createRid()

        expect(Queue.Sync.deduplication(sync)).toEqual({ id: `sync:${sync}` })
        expect(Queue.Sync.deduplication(sync)).toEqual(Queue.Sync.deduplication(sync))
        expect(Queue.Sync.deduplication(Sync.createRid()).id).not.toBe(Queue.Sync.deduplication(sync).id)
    })

    it("accepts a run nobody pressed (a schedule) and one somebody did", () => {
        const syncRid = Sync.createRid()

        expect(Queue.Sync.Job.safeParse({ syncRid, trigger: "schedule", triggeredBy: null }).success).toBe(true)
        expect(Queue.Sync.Job.safeParse({ syncRid, trigger: "cron", triggeredBy: null }).success).toBe(false)
    })
})
