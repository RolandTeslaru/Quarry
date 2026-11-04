import { layoutReducers, type LayoutReducers } from "./layout"
import { nodeReducers, type NodeReducers } from "./node"

export interface GraphReducers {
    node:   NodeReducers
    layout: LayoutReducers
}

export const graphReducers: GraphReducers = {
    node:   nodeReducers,
    layout: layoutReducers,
}
