import type { Graph } from "../../Graph"
import type { Document } from "../index"

export interface NodeSelectors {
    get:      <N extends Graph.Node>(document: Document<N>, rid: Graph.Node.Rid) => N
    has:      (document: Document, rid: Graph.Node.Rid) => boolean
    getCount: (document: Document) => number
}

export const nodeSelectors: NodeSelectors = {
    get:      (d, rid) => d.nodes[rid],
    has:      (d, rid) => rid in d.nodes,
    getCount: (d) => Object.keys(d.nodes).length,
}
