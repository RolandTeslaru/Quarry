import { z } from "zod"
import { Foundations } from "../Foundations"
import { Resource } from "./Resource"

/** How resources feed each other, upstream and downstream, whatever their types (docs/design/lineage.md). */
export namespace Lineage {

    /**
     * `upstream` feeds `downstream` on a branch. Identified by those three; there is no edge id.
     * Its declarer needn't be either end: a workspace declares dataset → dataset.
     */
    export namespace Edge {

        export const Schema = z.object({
            upstreamRid:   Resource.Rid,
            downstreamRid: Resource.Rid,
            branch:        Foundations.Branch,
            declaredByRid: Resource.Rid,
        })
    }
    export type Edge = z.infer<typeof Edge.Schema>

    /** How far a read goes from a resource: `depth` hops, or all the way, through trashed resources only if asked. */
    export namespace Walk {

        export const Schema = z.object({
            depth:          z.number().int().positive().nullable(),   // null: until nothing is left — a resource is visited once, so a cycle ends too
            includeTrashed: z.boolean(),
        })

        export const ONE_HOP: Walk = { depth: 1, includeTrashed: false }

        export const ALL_THE_WAY: Walk = { depth: null, includeTrashed: false }

        /** The most an HTTP read may ask for: a click shouldn't walk the whole workspace. */
        export const MAX_DEPTH = 20
    }
    export type Walk = z.infer<typeof Walk.Schema>

    /** Resources and the lineage edges among them — what a walk reads, or a canvas holds — with each one's parents and children. */
    export namespace Graph {

        export const Schema = z.object({
            resources:  z.record(Resource.Rid, Resource.Base),
            edges:      Edge.Schema.array(),
            parentsOf:  z.record(Resource.Rid, Resource.Rid.array()),   // what feeds each resource; none for a root
            childrenOf: z.record(Resource.Rid, Resource.Rid.array()),   // what each resource feeds; none for a leaf
        })

        /** The graph of these resources and the edges among them. */
        export function create(resources: Record<Resource.Rid, Resource.Base>, edges: Edge[]): Graph {
            const graph: Graph = { resources, edges, parentsOf: {}, childrenOf: {} }

            for (const rid of Object.keys(resources) as Resource.Rid[]) {
                graph.parentsOf[rid] = []
                graph.childrenOf[rid] = []
            }

            for (const edge of edges) {
                graph.parentsOf[edge.downstreamRid].push(edge.upstreamRid)
                graph.childrenOf[edge.upstreamRid].push(edge.downstreamRid)
            }

            return graph
        }
    }
    export type Graph = z.infer<typeof Graph.Schema>

    /**
     * Whether a dataset's current version is what its recipe would compute now. Its own reasons compare it with
     * its recipe and its parents' current versions only; `distance` says how far up the nearest stale resource is —
     * 0 for one with reasons, 1 for its children, and so on. What nothing builds is read as it is: always fresh.
     */
    export namespace Staleness {

        /**
         * `never-built`: no version written by a job of its recipe — none yet, or one written otherwise (an upload) ·
         * `logic-changed`: its recipe computes it differently than the one that wrote it ·
         * `inputs-changed`: an input has a newer version than the one that job read.
         */
        export const Reason = z.enum(["never-built", "logic-changed", "inputs-changed"])
        export type  Reason = z.infer<typeof Reason>

        export const Schema = z.object({
            reasons:       Reason.array(),                           // none: fresh against its parents
            changedInputs: Resource.Rid.array(),                     // for inputs-changed: which
            distance:      z.number().int().nonnegative().nullable(), // to the nearest resource with reasons, at or above it; null: none
        })

        /**
         * Each resource's distance to the nearest one with reasons at or above it, through the graph's edges: 0 for one with
         * reasons, else its nearest parent's plus one; null if nothing above it has any. Until a pass changes nothing — a cycle can't loop it.
         */
        export function getDistances(graph: Graph, reasons: Record<Resource.Rid, Reason[]>): Record<Resource.Rid, number | null> {
            const distances: Record<Resource.Rid, number | null> = {}
            let changed = true

            for (const rid of Object.keys(graph.resources) as Resource.Rid[])
                distances[rid] = reasons[rid].length > 0 ? 0 : null

            while (changed) {
                changed = false

                for (const rid of Object.keys(graph.resources) as Resource.Rid[]) {
                    if (distances[rid] === 0)
                        continue

                    for (const parentRid of graph.parentsOf[rid]) {
                        const parent = distances[parentRid]

                        if (parent === null)
                            continue

                        const current = distances[rid]

                        if (current === null || parent + 1 < current) {
                            distances[rid] = parent + 1
                            changed = true
                        }
                    }
                }
            }

            return distances
        }
    }
    export type Staleness = z.infer<typeof Staleness.Schema>
}
