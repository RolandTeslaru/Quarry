import type { Graph } from "../Graph"
import { graphReducers, type GraphReducers } from "./reducers"
import { graphSelectors, type GraphSelectors } from "./selectors"
import { COLUMN_GAP as _COLUMN_GAP, ROW_GAP as _ROW_GAP } from "./selectors/layout"

/** A graph being edited: its nodes and edges, and whether they differ from what was last saved. */
export interface Document<N extends Graph.Node = Graph.Node, E extends Graph.Edge = Graph.Edge> {
    nodes:   Record<Graph.Node.Rid, N>
    edges:   Record<Graph.Edge.Id, E>
    isDirty: boolean

    // Reducers reach their siblings through the document, so it carries them.
    reducers:  Document.Reducers
    selectors: Document.Selectors
}

export namespace Document {

    export type Reducers  = GraphReducers
    export type Selectors = GraphSelectors

    export const reducers  = graphReducers
    export const selectors = graphSelectors

    export const COLUMN_GAP = _COLUMN_GAP
    export const ROW_GAP    = _ROW_GAP

    /** A node's rendered size, measured by the canvas. */
    export type Size = {
        width:  number
        height: number
    }

    /** The nodes the canvas has measured; the rest are placed at an estimated size. */
    export type Sizes = Record<Graph.Node.Rid, Size>

    export type Side = "left" | "right"
}
