import { describe, expect, it } from "vitest"
import { Foundations } from "../Foundations"
import { Git } from "./Git"

const MAIN = Foundations.MAIN_BRANCH
const FEATURE = Foundations.Branch.parse("feature/orders")
const sha = (character: string) => Git.Commit.parse(character.repeat(40))

describe("Git.Commit", () => {

    it("accepts a full SHA-1", () => {
        expect(Git.Commit.safeParse("0123456789abcdef0123456789abcdef01234567").success).toBe(true)
    })

    it.each(["a1b2c3d", "0123456789ABCDEF0123456789ABCDEF01234567", "g".repeat(40), "a".repeat(41)])("refuses %s", (value) => {
        expect(Git.Commit.safeParse(value).success).toBe(false)
    })
})

describe("Git.Heads", () => {

    it("maps branches to commits", () => {
        expect(Git.Heads.safeParse({ main: "a".repeat(40), "feature/orders": "b".repeat(40) }).success).toBe(true)
    })

    it("refuses a bad branch name or commit", () => {
        expect(Git.Heads.safeParse({ "-main": "a".repeat(40) }).success).toBe(false)
        expect(Git.Heads.safeParse({ main: "abc" }).success).toBe(false)
    })
})

describe("Git.getMovedHeads", () => {

    it("keeps new and moved branches, at their new heads", () => {
        expect(Git.getMovedHeads({ [MAIN]: sha("a") }, { [MAIN]: sha("b"), [FEATURE]: sha("c") })).toEqual({ [MAIN]: sha("b"), [FEATURE]: sha("c") })
    })

    it("drops unchanged and deleted branches", () => {
        expect(Git.getMovedHeads({ [MAIN]: sha("a"), [FEATURE]: sha("c") }, { [MAIN]: sha("a") })).toEqual({})
    })

    it("treats every branch as new on a first push", () => {
        expect(Git.getMovedHeads({}, { [MAIN]: sha("a") })).toEqual({ [MAIN]: sha("a") })
    })
})
