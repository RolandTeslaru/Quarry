import { z } from "zod"
import { Storage } from "../Storage"
import { Foundations } from "../Foundations"
import { Resource } from "../Library/Resource"
import { ColumnSchema } from "./ColumnSchema"

/** A versioned table: immutable files + transactions + schema. The library fields plus the catalog's own. */
export namespace Dataset {

    export type  Rid = Foundations.Rid<"catalog", "dataset">
    export const Rid = Foundations.Rid.generateSchema("catalog", "dataset")
    export const createRid = () => Foundations.Rid.create("catalog", "dataset")

    export const Schema = Resource.Base.extend({
        rid:           Rid,
        type:          z.literal("dataset"),
        parentRid:     Resource.Rid,
        lastSequence:  z.number().int(),            // on branch main; 0 = nothing committed yet
    })
    export type Schema = z.infer<typeof Schema>

    /**
     * The dataset at one sequence on one branch: latest snapshot + later
     * transactions, applied in order. Computed on request, never stored — so
     * it has no identity of its own.
     */
    export namespace View {

        /** A stored file, plus its name within this dataset. */
        export const File = Storage.File.Schema.and(z.object({ logicalPath: z.string().min(1) }))
        export type  File = z.infer<typeof File>

        export const Schema = z.object({
            branch:   z.string(),
            sequence: z.number().int(),             // 0 = nothing committed yet
            schema:   ColumnSchema.Schema.nullable(),
            files:    File.array(),
            rowCount: z.number().int().nullable(),
        })
        export type Schema = z.infer<typeof Schema>
    }
}
