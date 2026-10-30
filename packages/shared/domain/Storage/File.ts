import { z } from "zod"

/**
 * A file in object storage: bytes at a key, plus what its format lets us know
 * about them. Storage-level only — it knows nothing about datasets. Whatever
 * uses a file adds its own context (a dataset adds a logical path).
 *
 * One namespace per format; `File.Schema` is the union, discriminated by
 * `format`. Add a format by adding a namespace and listing it in the union.
 */
export namespace File {

    /** The object's key in the bucket. Written once, never reused. */
    export const Key = z.string().min(1).brand("Storage.File.Key")
    export type  Key = z.infer<typeof Key>

    const Base = z.object({
        key:   Key,
        bytes: z.number().int().nonnegative(),
    })

    /** Columnar, typed, compressed — what syncs write. */
    export namespace Parquet {
        export const Schema = Base.extend({
            format:   z.literal("parquet"),
            rowCount: z.number().int().nonnegative().nullable(),    // from the footer; null if the writer didn't report it
        })
        export type Schema = z.infer<typeof Schema>
    }

    /**
     * Delimited text, stored exactly as uploaded. How to parse it (delimiter,
     * header, column types) is the dataset's schema, not the file's — Foundry's model.
     */
    export namespace Csv {
        export const Schema = Base.extend({
            format:   z.literal("csv"),
            rowCount: z.null(),                                     // unknown without reading it all
        })
        export type Schema = z.infer<typeof Schema>
    }

    export const Schema = z.discriminatedUnion("format", [Parquet.Schema, Csv.Schema])
    export type  Schema = z.infer<typeof Schema>

    export const Format = z.enum(["parquet", "csv"])
    export type  Format = z.infer<typeof Format>

    /** The format a key's or a file name's extension says it is, or null if it's not one we know. */
    export const formatOf = (name: string): Format | null => {
        const lower = name.toLowerCase()

        if (lower.endsWith(".parquet")) return "parquet"
        if (lower.endsWith(".csv"))     return "csv"

        return null
    }
}
