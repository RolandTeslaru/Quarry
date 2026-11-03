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

    /** How far a read goes from a resource: `depth` hops, through trashed resources only if asked. */
    export namespace Walk {

        export const Schema = z.object({
            depth:          z.number().int().positive(),
            includeTrashed: z.boolean(),
        })

        export const ONE_HOP = { depth: 1, includeTrashed: false }

        export const MAX_DEPTH = 20
    }
    export type Walk = z.infer<typeof Walk.Schema>
}
