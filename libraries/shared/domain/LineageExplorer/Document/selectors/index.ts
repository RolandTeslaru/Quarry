import { Graph as GraphDomain } from "../../../Graph/Graph"
import { explorationSelectors, type ExplorationSelectors } from "./exploration"

export interface LineageExplorerSelectors extends GraphDomain.Document.Selectors {
    exploration: ExplorationSelectors
}

export const lineageExplorerSelectors: LineageExplorerSelectors = {
    ...GraphDomain.Document.selectors,
    exploration: explorationSelectors,
}
