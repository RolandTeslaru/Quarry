import { describe, expect, it } from "vitest"
import { Commit } from "./Commit"

describe("Commit", () => {

    it("accepts a full SHA-1", () => {
        expect(Commit.safeParse("0123456789abcdef0123456789abcdef01234567").success).toBe(true)
    })

    it.each(["a1b2c3d", "0123456789ABCDEF0123456789ABCDEF01234567", "g".repeat(40), "a".repeat(41)])("refuses %s", (value) => {
        expect(Commit.safeParse(value).success).toBe(false)
    })
})
