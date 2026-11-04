import type { Resource } from "../../Library/Resource"
import type { Graph as GraphDomain } from "../../Graph/Graph"
import type { Exploration } from "../Exploration"
import type { Legend } from "../Legend"
import { Graph } from "../Graph"
import { lineageExplorerReducers, type LineageExplorerReducers } from "./reducers"
import { lineageExplorerSelectors, type LineageExplorerSelectors } from "./selectors"

/** An open exploration being edited: its graph, plus what saving it needs. */
export interface Document extends GraphDomain.Document<Graph.Node, Graph.Edge> {
    exploration: Exploration.Meta

    /** Saved nodes this viewer can't see: they go back with every save, or saving would delete them for everyone. */
    hiddenNodes: Exploration["nodes"]

    legend: Legend

    reducers:  Document.Reducers
    selectors: Document.Selectors
}

export namespace Document {

    export type Reducers  = LineageExplorerReducers
    export type Selectors = LineageExplorerSelectors

    export const reducers  = lineageExplorerReducers
    export const selectors = lineageExplorerSelectors

    /** Which way to read lineage from a node: what feeds it, or what it feeds. */
    export type Direction = "upstream" | "downstream"

    export function create(exploration: Exploration, graph: Graph): Document {
        const { nodes, legend, ...meta } = exploration

        const hiddenNodes: Exploration["nodes"] = {}

        for (const rid of Object.keys(nodes) as Resource.Rid[])
            if (!(Graph.Node.getRid(rid) in graph.nodes))
                hiddenNodes[rid] = nodes[rid]

        return {
            nodes:       graph.nodes,
            edges:       graph.edges,
            isDirty:     false,
            exploration: meta,
            hiddenNodes,
            legend,
            reducers,
            selectors,
        }
    }
}
