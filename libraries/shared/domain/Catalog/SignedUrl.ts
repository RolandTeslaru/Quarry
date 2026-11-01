import { z } from "zod"
import { Dataset } from "../Dataset/Dataset"
import { ColumnSchema } from "./ColumnSchema"

/** Short-lived signed URLs into a dataset's storage: whoever holds one reads or writes straight to the bucket, without credentials. */
export namespace SignedUrl {

    /** One version's files, to read. */
    export namespace Read {
        export const File = z.object({
            url:   z.string(),
            bytes: z.number().int().nonnegative(),
        })
        export type  File = z.infer<typeof File>

        export const Schema = z.object({
            sequence: Dataset.Sequence,
            schema:   ColumnSchema.Schema.nullable(),
            files:    File.array(),
        })
    }
    export type Read = z.infer<typeof Read.Schema>

    /** Where to PUT one file into an open transaction. */
    export namespace Write {
        export const Schema = z.object({ url: z.string() })
    }
    export type Write = z.infer<typeof Write.Schema>
}
