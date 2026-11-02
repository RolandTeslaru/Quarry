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

    /**
     * How far an incremental writer got: the column it reads by, and that column's last value — opaque to
     * Catalog. The column is set when the transaction opens, the state when it commits, so a failed run leaves the mark where it was.
     */
    export namespace Incremental {
        export const Schema = z.object({
            column: z.string().min(1),
            state:  z.string().nullable(),
        })

        /** Each dataset's mark. */
        export const States = z.record(Dataset.Rid, Schema.shape.state)
        export type  States = z.infer<typeof States>
    }
    export type Incremental = z.infer<typeof Incremental.Schema>

    /** What opening a transaction on a dataset takes: its type, and what opened it (`{ buildRid, jobRid }`). */
    export namespace Opening {
        const provenance = z.record(z.string(), z.unknown())

        export const Schema = z.discriminatedUnion("type", [
            z.object({ type: z.literal("snapshot"), provenance }),
            z.object({ type: z.literal("append"), provenance, incrementalColumn: z.string().min(1).nullable() }),   // null: not incremental, an upload
            z.object({ type: z.literal("update"), provenance }),
            z.object({ type: z.literal("delete"), provenance }),
        ])
    }
    export type Opening = z.infer<typeof Opening.Schema>

    const Base = z.object({
        rid:        Rid,
        datasetRid: Dataset.Rid,
        branch:     Foundations.Branch,
        status:     Status,
        sequence:   Dataset.Sequence.nullable(),
        schema:     ColumnSchema.Schema.nullable(),
        provenance: z.record(z.string(), z.unknown()),
        startedBy:  User.Rid.nullable(),
        startedAt:  z.coerce.date(),
        finishedAt: z.coerce.date().nullable(),
    })

    export const Schema = z.discriminatedUnion("type", [
        Base.extend({ type: z.literal("snapshot") }),
        Base.extend({ type: z.literal("append"), incremental: Incremental.Schema.nullable() }),   // null: not incremental, an upload
        Base.extend({ type: z.literal("update") }),
        Base.extend({ type: z.literal("delete") }),
    ])

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
    }
    export type FileChange = z.infer<typeof FileChange.Schema>
}
export type Transaction = z.infer<typeof Transaction.Schema>
