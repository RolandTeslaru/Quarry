import { z } from "zod"
import { Lineage } from "../Library/Lineage"
import { Resource } from "../Library/Resource"
import { Graph as GraphDomain } from "../Graph/Graph"
import type { Exploration } from "./Exploration"

/** Lineage Explorer's graph: library resources as nodes, the lineage between them as edges. */
export namespace Graph {

    export namespace Node {
        export const Schema = GraphDomain.Node
            .generateSchema(Resource.Rid)
            .extend({
                libraryResource: Resource.Base
            })

        export type Rid = Node["rid"]

        /** A resource's node is keyed by the resource's own RID. */
        export const getRid = (resourceRid: Resource.Rid) => resourceRid as Rid

        export const createFromResource = (resource: Resource.Base, position: GraphDomain.Node["position"]): Node => ({
            rid:             getRid(resource.rid),
            position,
            libraryResource: resource,
        })
    }
    export type Node = z.infer<typeof Node.Schema>

    export namespace Edge {
        export const Schema = GraphDomain.Edge
            .generateSchema(Resource.Rid)
            .extend({
                lineageEdge: Lineage.Edge.Schema
            })

        /** Upstream feeds downstream, so the edge points from upstream to downstream. */
        export const create = (lineageEdge: Lineage.Edge): Edge => ({
            sourceRid:   Node.getRid(lineageEdge.upstreamRid),
            targetRid:   Node.getRid(lineageEdge.downstreamRid),
            type:        "bezier",
            lineageEdge,
        })
    }
    export type Edge = z.infer<typeof Edge.Schema>

    export const Schema = GraphDomain.generateSchema(Node.Schema, Edge.Schema)

    /** An exploration's graph: a saved node whose resource the viewer can't see stays out of it, but stays in the exploration. */
    export const rehydrate = (
        nodes:     Exploration["nodes"],
        resources: Record<Resource.Rid, Resource.Base>,
        edges:     Lineage.Edge[],
    ): Graph => {
        const graph: Graph = {
            nodes: {},
            edges: {},
        }

        for (const resource of Object.values(resources)) {
            const node = Node.createFromResource(resource, nodes[resource.rid])

            graph.nodes[node.rid] = node
        }

        for (const lineageEdge of edges) {
            const edge = Edge.create(lineageEdge)

            graph.edges[GraphDomain.Edge.getId(edge)] = edge
        }

        return graph
    }
}
export type Graph = z.infer<typeof Graph.Schema>
