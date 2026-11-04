import type { Graph } from "../../Graph"
import type { Document } from "../index"

export interface NodeReducers {
    add:    <N extends Graph.Node>(document: Document<N>, node: N) => void
    /** Its edges go with it. */
    remove: (document: Document, rid: Graph.Node.Rid) => void
}

export const nodeReducers: NodeReducers = {
    add: (d, node) => {
        d.nodes[node.rid] = node
        d.isDirty = true
    },

    remove: (d, rid) => {
        delete d.nodes[rid]

        for (const id of Object.keys(d.edges) as Graph.Edge.Id[]) {
            const edge = d.edges[id]

            if (edge.sourceRid === rid || edge.targetRid === rid)
                delete d.edges[id]
        }

        d.isDirty = true
    },
}
