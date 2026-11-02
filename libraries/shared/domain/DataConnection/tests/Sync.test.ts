import { describe, expect, it } from "vitest"
import { Sync } from "../Sync"

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
