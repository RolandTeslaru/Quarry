import { z } from "zod"
import { Foundations } from "../Foundations"

/**
 * The scope every object type and link type belongs to. One per deployment, seeded by
 * ontology/001_initial.sql: not a library resource, and nothing creates another yet (docs/design/ontology.md §2).
 */
export namespace Ontology {

    export type  Rid = Foundations.Rid<"ontology", "ontology">
    export const Rid = Foundations.Rid.generateSchema("ontology", "ontology")

    /** The deployment's ontology: every type is created in it. */
    export const DEFAULT_RID = Rid.parse("ri.ontology.main.ontology.00000000-0000-7000-8000-000000000000")

    export const Schema = z.object({
        rid:         Rid,
        apiName:     z.string().min(1),
        displayName: z.string().min(1),
    })
}
export type Ontology = z.infer<typeof Ontology.Schema>
