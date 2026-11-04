import type { Graph } from "../../Graph"
import type { Document } from "../index"

export interface LayoutReducers {
    node: {
        setPosition:  (document: Document, rid: Graph.Node.Rid, position: Graph.Node["position"]) => void
        setPositions: (document: Document, positions: Record<Graph.Node.Rid, Graph.Node["position"]>) => void
    }
}

export const layoutReducers: LayoutReducers = {
    node: {
        setPosition: (d, rid, position) => {
            const current = d.nodes[rid].position

            if (current.x === position.x && current.y === position.y)
                return

            d.nodes[rid].position = position
            d.isDirty = true
        },

        setPositions: (d, positions) => {
            for (const rid of Object.keys(positions) as Graph.Node.Rid[])
                layoutReducers.node.setPosition(d, rid, positions[rid])
        },
    },
}
