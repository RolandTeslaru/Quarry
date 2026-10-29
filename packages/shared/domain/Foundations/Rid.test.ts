import { describe, expect, it } from "vitest"
import { Rid } from "./Rid"

describe("Rid", () => {

    const Dataset = Rid.generateSchema("catalog", "dataset")

    it("creates RIDs that parse as their own type", () => {
        expect(Dataset.safeParse(Rid.create("catalog", "dataset")).success).toBe(true)
    })

    it("orders RIDs made in different milliseconds by time (uuidv7; within one millisecond, no order)", async () => {
        const first = Rid.create("catalog", "dataset")

        await new Promise((resolve) => setTimeout(resolve, 2))

        expect(first < Rid.create("catalog", "dataset")).toBe(true)
    })

    it("refuses another service's or type's RID", () => {
        expect(Dataset.safeParse(Rid.create("catalog", "transaction")).success).toBe(false)
        expect(Dataset.safeParse(Rid.create("forge", "dataset")).success).toBe(false)
        expect(Dataset.safeParse("ri.catalog.main.dataset.not-a-uuid").success).toBe(false)
    })

    it("accepts any of several types with ofTypes", () => {
        const Container = Rid.ofTypes(["project", "folder"])

        expect(Container.safeParse(Rid.create("library", "folder")).success).toBe(true)
        expect(Container.safeParse(Rid.create("library", "dataset")).success).toBe(false)
    })

    it("splits a RID into its parts", () => {
        const rid = Rid.create("forge", "recipe")

        expect(Rid.parse(rid)).toMatchObject({ service: "forge", instance: "main", type: "recipe" })
    })
})
