import type { Resource } from "../../../Library/Resource"
import type { Document } from "../index"

export interface LegendSelectors {
    /** How many nodes on the canvas are of each resource type: the `resource-type` legend's entries. */
    getResourceTypeCounts: (document: Document) => Partial<Record<Resource.Type, number>>
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
}
