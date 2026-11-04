import { Graph as GraphDomain } from "../../../Graph/Graph"
import { explorationReducers, type ExplorationReducers } from "./exploration"
import { lineageReducers, type LineageReducers } from "./lineage"
import { resourceReducers, type ResourceReducers } from "./resource"

export interface LineageExplorerReducers extends GraphDomain.Document.Reducers {
    resource:    ResourceReducers
    lineage:     LineageReducers
    exploration: ExplorationReducers
}

export const lineageExplorerReducers: LineageExplorerReducers = {
    ...GraphDomain.Document.reducers,
    resource:    resourceReducers,
    lineage:     lineageReducers,
    exploration: explorationReducers,
}
