import type { Lineage } from "../../../Library/Lineage"
import type { Resource } from "../../../Library/Resource"
import { Graph as GraphDomain } from "../../../Graph/Graph"
import { Graph } from "../../Graph"
import type { Document } from "../index"

export interface LineageReducers {
    /** The resources read from `rid` that aren't on the canvas yet, in a column on that side of it. */
    addNeighbours: (
        document:  Document,
        rid:       Graph.Node.Rid,
        direction: Document.Direction,
        resources: Record<Resource.Rid, Resource.Base>,
        sizes:     GraphDomain.Document.Sizes,
    ) => void

    /** The edges among the nodes, as the Library read them. Edges are never saved, so this leaves the document clean. */
    setEdges: (document: Document, lineageEdges: Lineage.Edge[]) => void

    /** How every edge is drawn, now and as edges are read again. Saved with the exploration. */
    setEdgeType: (document: Document, type: Document["edgeType"]) => void

    /** Another branch, with the edges among the nodes on it. Saved with the exploration. */
    setBranch: (document: Document, branch: Document["branch"], lineageEdges: Lineage.Edge[]) => void
}

export const lineageReducers: LineageReducers = {
    addNeighbours: (d, rid, direction, resources, sizes) => {
        const neighbours: Resource.Base[] = []

        for (const resource of Object.values(resources))
            if (!d.selectors.node.has(d, Graph.Node.getRid(resource.rid)))
                neighbours.push(resource)

        let side: GraphDomain.Document.Side = "right"

        if (direction === "upstream")
            side = "left"

        const positions = d.selectors.layout.getColumnBeside(d, rid, side, neighbours.length, sizes)

        for (let index = 0; index < neighbours.length; index++)
            d.reducers.node.add(d, Graph.Node.createFromResource(neighbours[index], positions[index]))
    },

    setEdges: (d, lineageEdges) => {
        d.edges = {}

        for (const lineageEdge of lineageEdges) {
            const edge = Graph.Edge.create(lineageEdge, d.edgeType)

            d.edges[GraphDomain.Edge.getId(edge)] = edge
        }
    },

    setEdgeType: (d, type) => {
        d.edgeType = type

        for (const edge of Object.values(d.edges))
            edge.type = type

        d.isDirty = true
    },

    setBranch: (d, branch, lineageEdges) => {
        d.branch = branch
        d.reducers.lineage.setEdges(d, lineageEdges)
        d.isDirty = true
    },
}
