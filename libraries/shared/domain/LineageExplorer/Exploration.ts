import { z } from "zod"
import { Foundations } from "../Foundations"
import { Resource } from "../Library/Resource"
import { Legend } from "./Legend"

/**
 * A saved graph in Lineage Explorer — a library resource. It holds what's on the canvas and where;
 * its edges are read when it's opened, so it can't go stale.
 */
export namespace Exploration {

    export type  Rid = Foundations.Rid<"lineage-explorer", "lineage-exploration">
    export const Rid = Foundations.Rid.generateSchema("lineage-explorer", "lineage-exploration")
    export const createRid = () => Foundations.Rid.create("lineage-explorer", "lineage-exploration")

    /** Where a resource sits on the canvas. */
    export namespace Node {

        export const Schema = z.object({
            x: z.number(),
            y: z.number(),
        })
    }
    export type Node = z.infer<typeof Node.Schema>

    export const Schema = Resource.Base.extend({
        rid:       Rid,
        type:      z.literal("lineage-exploration"),
        parentRid: Resource.Rid,
        branch:    Foundations.Branch,
        /** A resource is on the canvas if it's a key here. */
        nodes:     z.record(Resource.Rid, Node.Schema),
        legend:    Legend.Schema,
    })

    /** Listing rows: everything but what's on the canvas. */
    export namespace Meta {
        export const Schema = Exploration.Schema.omit({ nodes: true, legend: true })
    }
    export type Meta = z.infer<typeof Meta.Schema>
}
export type Exploration = z.infer<typeof Exploration.Schema>
