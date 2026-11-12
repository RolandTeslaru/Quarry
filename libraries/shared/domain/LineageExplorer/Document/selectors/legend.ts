import type { Dataset } from "../../../Dataset/Dataset"
import type { Lineage } from "../../../Library/Lineage"
import type { Resource } from "../../../Library/Resource"
import { Legend } from "../../Legend"
import type { Document } from "../index"

export interface LegendSelectors {
    /** How many nodes on the canvas are of each resource type: the `resource-type` legend's entries. */
    getResourceTypeCounts: (document: Document) => Partial<Record<Resource.Type, number>>

    /** How many nodes on the canvas are in each `staleness` entry, by Forge's answer for the canvas's datasets. */
    getStalenessCounts: (document: Document, staleness: Record<Dataset.Rid, Lineage.Staleness> | undefined) => Partial<Record<Legend.Staleness.Key, number>>

    /** The datasets on the canvas: what the `staleness` legend asks Forge about. */
    getDatasetRids: (document: Document) => Dataset.Rid[]
}

export const legendSelectors: LegendSelectors = {
    getResourceTypeCounts: (d) => {
        const counts: Partial<Record<Resource.Type, number>> = {}

        for (const node of Object.values(d.nodes)) {
            const type = node.libraryResource.type

            counts[type] = (counts[type] ?? 0) + 1
        }

        return counts
    },

    getStalenessCounts: (d, staleness) => {
        const counts: Partial<Record<Legend.Staleness.Key, number>> = {}

        for (const node of Object.values(d.nodes)) {
            const key = Legend.Staleness.getKey(node.libraryResource, staleness)

            counts[key] = (counts[key] ?? 0) + 1
        }

        return counts
    },

    getDatasetRids: (d) => {
        const rids: Dataset.Rid[] = []

        for (const node of Object.values(d.nodes))
            if (node.libraryResource.type === "dataset")
                rids.push(node.libraryResource.rid as Dataset.Rid)

        return rids
    },
}
