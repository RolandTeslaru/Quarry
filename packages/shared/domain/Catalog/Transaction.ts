import { z } from "zod"
import { Storage } from "../Storage"
import { Foundations } from "../Foundations"
import { User } from "../Identity/User"
import { ColumnSchema } from "./ColumnSchema"
import { Dataset } from "../Dataset/Dataset"

/** One change to a dataset's file set. Only committed transactions are visible. */
export namespace Transaction {

    /** A RID, but not a library resource — Gatekeeper never sees these. */
    export type  Rid = Foundations.Rid<"catalog", "transaction">
    export const Rid = Foundations.Rid.generateSchema("catalog", "transaction")
    export const createRid = () => Foundations.Rid.create("catalog", "transaction")

    export const Type = z.enum(["snapshot", "append", "update", "delete"])
    export type  Type = z.infer<typeof Type>

    export const Status = z.enum(["open", "committed", "aborted"])
    export type  Status = z.infer<typeof Status>

    export const Schema = z.object({
        rid:        Rid,
        datasetRid: Dataset.Rid,
        branch:     Foundations.Branch,
        type:       Type,
        status:     Status,
        sequence:   Dataset.Sequence.nullable(),
        schema:     ColumnSchema.Schema.nullable(),
    provenance: z.record(z.string(), z.unknown()),
        startedBy:  User.Rid.nullable(),
        startedAt:  z.coerce.date(),
        finishedAt: z.coerce.date().nullable(),
    })
    export type Schema = z.infer<typeof Schema>

    /**
     * One entry in a transaction's change list — an instruction, not a file:
     * "add this stored file at this logical path" or "remove this logical path
     * from the view". The logical path is the file's name within the dataset.
     */
    export namespace FileChange {
        export const Op = z.enum(["add", "remove"])
        export type  Op = z.infer<typeof Op>

        export const LogicalPath = z.string().min(1)

        export const Add    = Storage.File.Schema.and(z.object({ op: z.literal("add"), logicalPath: LogicalPath }))
        export const Remove = z.object({ op: z.literal("remove"), logicalPath: LogicalPath })

        export const Schema = z.union([Add, Remove])
        export type  Schema = z.infer<typeof Schema>
    }
}
