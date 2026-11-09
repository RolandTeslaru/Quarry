import type { Exploration } from "../../Exploration"
import type { Document } from "../index"

export interface ExplorationReducers {
    /** The exploration as the save returned it; the canvas already shows what was saved. */
    markSaved: (document: Document, exploration: Exploration) => void
}

export const explorationReducers: ExplorationReducers = {
    markSaved: (d, exploration) => {
        const { nodes: _nodes, legend: _legend, edgeType: _edgeType, branch: _branch, ...meta } = exploration

        d.exploration = meta
        d.isDirty = false
    },
}
