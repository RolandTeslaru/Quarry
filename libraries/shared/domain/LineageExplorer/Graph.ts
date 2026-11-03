import { z } from "zod"
import { Lineage } from "../Library/Lineage"
import { Resource } from "../Library/Resource"
import { Exploration } from "./Exploration"

/**
 * The working exploration: the saved one, plus what was read when it was opened — the resources on
 * its canvas that the viewer can see, and the edges among them. Loaded once, when the page opens.
 */
export namespace Graph {

    export const Schema = Exploration.Schema.extend({
        resources: z.record(Resource.Rid, Resource.Base),
        edges:     Lineage.Edge.Schema.array(),
    })
}
export type Graph = z.infer<typeof Graph.Schema>
