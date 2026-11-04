import type { Graph } from "../../Graph"
import type { Document } from "../index"

// A node's size until the canvas has measured it: new nodes are placed before they render.
const ESTIMATED_SIZE: Document.Size = {
    width:  200,
    height: 46,
}

export const COLUMN_GAP = 96
export const ROW_GAP = 24

export interface LayoutSelectors {
    getSize: (sizes: Document.Sizes, rid: Graph.Node.Rid) => Document.Size

    /** Under everything on the canvas: where a node added by hand goes. */
    getPositionBelow: (document: Document, sizes: Document.Sizes) => Graph.Node["position"]

    /** A column of `count` new nodes beside `rid`, centred on it, at their estimated size. Nothing else moves. */
    getColumnBeside: (
        document: Document,
        rid:      Graph.Node.Rid,
        side:     Document.Side,
        count:    number,
        sizes:    Document.Sizes,
    ) => Graph.Node["position"][]
}

export const layoutSelectors: LayoutSelectors = {
    getSize: (sizes, rid) => sizes[rid] ?? ESTIMATED_SIZE,

    getPositionBelow: (d, sizes) => {
        const rids = Object.keys(d.nodes) as Graph.Node.Rid[]

        if (rids.length === 0)
            return { x: 0, y: 0 }

        let x = Infinity
        let bottom = -Infinity

        for (const rid of rids) {
            const position = d.nodes[rid].position

            x = Math.min(x, position.x)
            bottom = Math.max(bottom, position.y + layoutSelectors.getSize(sizes, rid).height)
        }

        return {
            x,
            y: bottom + ROW_GAP,
        }
    },

    getColumnBeside: (d, rid, side, count, sizes) => {
        const origin = d.nodes[rid].position
        const size = layoutSelectors.getSize(sizes, rid)

        let x = origin.x + size.width + COLUMN_GAP

        if (side === "left")
            x = origin.x - COLUMN_GAP - ESTIMATED_SIZE.width

        const columnHeight = count * ESTIMATED_SIZE.height + (count - 1) * ROW_GAP
        const top = origin.y + size.height / 2 - columnHeight / 2

        const positions: Graph.Node["position"][] = []

        for (let index = 0; index < count; index++) {
            positions.push({
                x,
                y: top + index * (ESTIMATED_SIZE.height + ROW_GAP),
            })
        }

        return positions
    },
}
