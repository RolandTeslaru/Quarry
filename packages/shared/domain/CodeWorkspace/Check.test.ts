import { describe, expect, it } from "vitest"
import { Check } from "./Check"

const PUBLISH = { name: "Publish transforms", uses: "quarry/publish-transforms" }
const RID = "ri.catalog.main.dataset.01234567-89ab-cdef-0123-456789abcdef"

describe("Check.Config", () => {

    it("accepts the template's steps, with default timeouts", () => {
        const config = Check.Config.Schema.parse({
            steps: [
                { name: "Environment", run: "uv sync --frozen" },
                { name: "Tests", run: "pytest -q", timeoutMinutes: 20 },
                PUBLISH,
            ],
        })

        expect(config.steps.map((step) => step.timeoutMinutes)).toEqual([10, 20, 10])
    })

    it("accepts publishing alone", () => {
        expect(Check.Config.Schema.safeParse({ steps: [PUBLISH] }).success).toBe(true)
    })

    it("refuses a file without the publish step", () => {
        const result = Check.Config.Schema.safeParse({ steps: [{ name: "Tests", run: "pytest" }] })

        expect(result.error?.issues[0].message).toMatch(/exactly one/)
    })

    it("refuses two publish steps", () => {
        expect(Check.Config.Schema.safeParse({ steps: [PUBLISH, PUBLISH] }).success).toBe(false)
    })

    it("refuses publishing before the last step", () => {
        const result = Check.Config.Schema.safeParse({ steps: [PUBLISH, { name: "Tests", run: "pytest" }] })

        expect(result.error?.issues[0].message).toMatch(/last step/)
    })

    it.each([
        ["both run and uses", { name: "x", run: "ls", uses: "quarry/publish-transforms" }],
        ["neither run nor uses", { name: "x" }],
        ["an unknown uses", { name: "x", uses: "someone/else" }],
        ["an empty command", { name: "x", run: "  " }],
        ["a blank name", { name: " ", run: "ls" }],
        ["a timeout over 30 minutes", { name: "x", run: "ls", timeoutMinutes: 31 }],
        ["an unknown key", { name: "x", run: "ls", shell: "bash" }],
    ])("refuses a step with %s", (_, step) => {
        expect(Check.Config.Schema.safeParse({ steps: [step, PUBLISH] }).success).toBe(false)
    })

    it("refuses no steps, and unknown top-level keys", () => {
        expect(Check.Config.Schema.safeParse({ steps: [] }).success).toBe(false)
        expect(Check.Config.Schema.safeParse({ steps: [PUBLISH], on: "push" }).success).toBe(false)
    })
})

describe("Check.Manifest", () => {

    const transform = (name: string, outputs: Record<string, string>) => ({
        name,
        inputs:    { raw: "/Sales/raw/orders" },
        outputs,
        resources: { cpuCores: 1, memoryGb: 4 },
    })

    it("accepts transforms writing paths and RIDs", () => {
        const manifest = Check.Manifest.Schema.safeParse({
            transforms: [
                transform("sales.datasets.orders.clean", { out: "/Sales/clean/orders" }),
                transform("sales.datasets.orders.summary", { out: RID }),
            ],
        })

        expect(manifest.success).toBe(true)
    })

    it("refuses a pipeline with no transforms", () => {
        expect(Check.Manifest.Schema.safeParse({ transforms: [] }).error?.issues[0].message).toMatch(/no transforms/)
    })

    it("refuses two transforms writing the same output, naming it", () => {
        const result = Check.Manifest.Schema.safeParse({
            transforms: [
                transform("sales.datasets.a.a", { out: "/Sales/clean/orders" }),
                transform("sales.datasets.b.b", { out: "/Sales/clean/orders" }),
            ],
        })

        expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Two transforms write /Sales/clean/orders"])
    })

    it("refuses a reference that's neither a path nor a dataset RID", () => {
        expect(Check.Manifest.Schema.safeParse({ transforms: [transform("sales.datasets.a.a", { out: "clean/orders" })] }).success).toBe(false)
    })
})
