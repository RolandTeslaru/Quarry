import { describe, expect, it } from "vitest"
import { Dataset } from "../../Dataset/Dataset"
import type { Lineage } from "../../Library/Lineage"
import type { Resource } from "../../Library/Resource"
import { Legend } from "../Legend"

const DATASET = { rid: Dataset.createRid(), type: "dataset" } as Resource.Base
const SOURCE = { rid: "ri.data-connection.main.source.1", type: "source" } as Resource.Base

function stalenessOf(staleness: Partial<Lineage.Staleness>): Record<Dataset.Rid, Lineage.Staleness> {
    return { [DATASET.rid]: { reasons: [], changedInputs: [], distance: null, ...staleness } }
}

describe("Legend.Staleness.getKey", () => {

    it("names a dataset by its own reason, logic changed over inputs changed", () => {
        expect(Legend.Staleness.getKey(DATASET, stalenessOf({ reasons: ["never-built"], distance: 0 }))).toBe("never-built")
        expect(Legend.Staleness.getKey(DATASET, stalenessOf({ reasons: ["inputs-changed", "logic-changed"], distance: 0 }))).toBe("logic-changed")
        expect(Legend.Staleness.getKey(DATASET, stalenessOf({ reasons: ["inputs-changed"], distance: 0 }))).toBe("inputs-changed")
    })

    it("is stale upstream with no reasons of its own but something stale above it, else fresh", () => {
        expect(Legend.Staleness.getKey(DATASET, stalenessOf({ distance: 2 }))).toBe("stale-upstream")
        expect(Legend.Staleness.getKey(DATASET, stalenessOf({}))).toBe("fresh")
    })

    it("is checking until Forge has answered for the dataset, and not a dataset for a source", () => {
        expect(Legend.Staleness.getKey(DATASET, undefined)).toBe("checking")
        expect(Legend.Staleness.getKey(DATASET, {})).toBe("checking")
        expect(Legend.Staleness.getKey(SOURCE, stalenessOf({}))).toBe("not-a-dataset")
    })
})
