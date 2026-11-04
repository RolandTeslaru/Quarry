import type { Resource } from "../../../Library/Resource"
import type { Exploration } from "../../Exploration"
import type { Document } from "../index"

export interface ExplorationSelectors {
    /** What a save sends: every node on the canvas where it is now, plus the hidden ones as they were. */
    getSavedNodes: (document: Document) => Exploration["nodes"]

    getResourceRids: (document: Document) => Resource.Rid[]
}

export const explorationSelectors: ExplorationSelectors = {
    getSavedNodes: (d) => {
        const saved: Exploration["nodes"] = { ...d.hiddenNodes }

        for (const node of Object.values(d.nodes))
            saved[node.libraryResource.rid] = node.position

        return saved
    },

    getResourceRids: (d) => {
        const rids: Resource.Rid[] = []

        for (const node of Object.values(d.nodes))
            rids.push(node.libraryResource.rid)

        return rids
    },
}
