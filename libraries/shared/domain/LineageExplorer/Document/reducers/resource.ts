import type { Resource } from "../../../Library/Resource"
import type { Graph as GraphDomain } from "../../../Graph/Graph"
import { Graph } from "../../Graph"
import type { Document } from "../index"

export interface ResourceReducers {
    /** A resource added by hand: under everything on the canvas. */
    add: (document: Document, resource: Resource.Base, sizes: GraphDomain.Document.Sizes) => void
}

export const resourceReducers: ResourceReducers = {
    add: (d, resource, sizes) => {
        const position = d.selectors.layout.getPositionBelow(d, sizes)

        d.reducers.node.add(d, Graph.Node.createFromResource(resource, position))
    },
}
