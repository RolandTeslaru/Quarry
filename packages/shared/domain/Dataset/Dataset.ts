import { z } from "zod"
import { Storage } from "../Storage"
import { Foundations } from "../Foundations"
import { Resource } from "../Library/Resource"
import { ColumnSchema } from "../Catalog/ColumnSchema"
import type { Transaction } from "../Catalog/Transaction"

/** A versioned table: immutable files + transactions + schema. The library fields plus the catalog's own. */
export namespace Dataset {

    export type  Rid = Foundations.Rid<"catalog", "dataset">
    export const Rid = Foundations.Rid.generateSchema("catalog", "dataset")
    export const createRid = () => Foundations.Rid.create("catalog", "dataset")

    /** A version's number on its branch: 1, 2, … in commit order. 0 = nothing committed yet. */
    export const Sequence = z.number().int().nonnegative().brand("Dataset.Sequence")
    export type  Sequence = z.infer<typeof Sequence>

    export const Schema = Resource.Base.extend({
        rid:           Rid,
        type:          z.literal("dataset"),
        parentRid:     Resource.Rid,
        lastSequence:  Sequence,                    // on branch main
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
            branch:   Foundations.Branch,
            sequence: Sequence,
            schema:   ColumnSchema.Schema.nullable(),
            files:    File.array(),
            rowCount: z.number().int().nullable(),
        })
        export type Schema = z.infer<typeof Schema>
    }

    /** One version's files as short-lived signed URLs: whoever holds them reads straight from storage. */
    export namespace ReadPasses {
        export const File = z.object({
            url:   z.string(),
            bytes: z.number().int().nonnegative(),
        })
        export type  File = z.infer<typeof File>

        export const Schema = z.object({
            sequence: Sequence,
            schema:   ColumnSchema.Schema.nullable(),
            files:    File.array(),
        })
        export type  Schema = z.infer<typeof Schema>
    }

    /** The bucket folder for one transaction's files. A new folder per transaction: keys are never reused. */
    export const getStoragePrefix = (rid: Rid, transactionRid: Transaction.Rid): string => `${rid}/${transactionRid}/`

    /** The bucket key of one of a transaction's files. */
    export const getStorageKey = (rid: Rid, transactionRid: Transaction.Rid, filename: string): Storage.File.Key =>
        Storage.File.Key.parse(`${getStoragePrefix(rid, transactionRid)}${filename}`)
}
