import { describe, expect, it } from "vitest"
import { Build } from "./Build"
import { JobSpec } from "./JobSpec"

const [A, B, C, D] = [JobSpec.createRid(), JobSpec.createRid(), JobSpec.createRid(), JobSpec.createRid()]

/** A → B, A → C, B → D, C → D */
const diamond: Build.Plan.Schema = {
    roots:    [A],
    children: { [A]: [B, C], [B]: [D], [C]: [D], [D]: [] },
}

describe("Build.Plan", () => {

    describe("getParents", () => {

        it("finds every node a node waits for", () => {
            expect(Build.Plan.getParents(diamond, D).sort()).toEqual([B, C].sort())
            expect(Build.Plan.getParents(diamond, B)).toEqual([A])
        })

        it("finds none for a root", () => {
            expect(Build.Plan.getParents(diamond, A)).toEqual([])
        })
    })

    describe("getReadyChildren", () => {

        it("readies a child whose only parent finished", () => {
            expect(Build.Plan.getReadyChildren(diamond, A, new Set([A])).sort()).toEqual([B, C].sort())
        })

        it("holds a child until every parent succeeded", () => {
            expect(Build.Plan.getReadyChildren(diamond, B, new Set([A, B]))).toEqual([])
            expect(Build.Plan.getReadyChildren(diamond, C, new Set([A, B, C]))).toEqual([D])
        })

        it("readies nothing after a leaf", () => {
            expect(Build.Plan.getReadyChildren(diamond, D, new Set([A, B, C, D]))).toEqual([])
        })

        it("readies nothing for a node the plan doesn't have", () => {
            expect(Build.Plan.getReadyChildren(diamond, JobSpec.createRid(), new Set([A]))).toEqual([])
        })

        it("only counts successes: a failed parent never readies its child", () => {
            const chain: Build.Plan.Schema = { roots: [A], children: { [A]: [B], [B]: [] } }

            expect(Build.Plan.getReadyChildren(chain, A, new Set())).toEqual([])
        })
    })

    describe("Schema", () => {

        it("needs at least one root", () => {
            expect(Build.Plan.Schema.safeParse({ roots: [], children: {} }).success).toBe(false)
            expect(Build.Plan.Schema.safeParse(diamond).success).toBe(true)
        })
    })
})

describe("Build.Target", () => {

    it("accepts the three kinds", () => {
        const dataset = "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2"

        expect(Build.Target.parse({ type: "manual", datasetRids: [dataset] }).type).toBe("manual")
        expect(Build.Target.parse({ type: "upstream", datasetRids: [dataset] }).type).toBe("upstream")
        expect(Build.Target.parse({ type: "connecting", inputRids: [dataset], datasetRids: [dataset] }).type).toBe("connecting")
    })

    it("needs at least one dataset, and only datasets", () => {
        expect(Build.Target.safeParse({ type: "manual", datasetRids: [] }).success).toBe(false)
        expect(Build.Target.safeParse({ type: "manual", datasetRids: ["ri.library.main.folder.01a1729a-975b-70de-8141-89cca28b34d2"] }).success).toBe(false)
    })
})
