import { Graph as GraphDomain } from "../../../Graph/Graph"
import { explorationSelectors, type ExplorationSelectors } from "./exploration"
import { legendSelectors, type LegendSelectors } from "./legend"

export interface LineageExplorerSelectors extends GraphDomain.Document.Selectors {
    exploration: ExplorationSelectors
    legend:      LegendSelectors
}

export const lineageExplorerSelectors: LineageExplorerSelectors = {
    ...GraphDomain.Document.selectors,
    exploration: explorationSelectors,
    legend:      legendSelectors,
}
