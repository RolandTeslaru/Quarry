import { layoutSelectors, type LayoutSelectors } from "./layout"
import { nodeSelectors, type NodeSelectors } from "./node"

export interface GraphSelectors {
    node:   NodeSelectors
    layout: LayoutSelectors
}

export const graphSelectors: GraphSelectors = {
    node:   nodeSelectors,
    layout: layoutSelectors,
}
