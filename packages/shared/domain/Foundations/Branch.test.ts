import { describe, expect, it } from "vitest"
import { Branch } from "./Branch"

describe("Branch", () => {

    it.each(["main", "testing", "feature/x", "release-1.2", "user/roland/fix_3"])("accepts %s", (name) => {
        expect(Branch.safeParse(name).success).toBe(true)
    })

    it.each(["", "-x", "a..b", "a//b", "a/", "x.lock", "a b", "a:b", "a~b", "a^b"])("refuses %j", (name) => {
        expect(Branch.safeParse(name).success).toBe(false)
    })
})
