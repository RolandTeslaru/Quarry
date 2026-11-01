import { z } from "zod"

/**
 * The dataset type system — independent of any source's native types. Each
 * source adapter maps its own types onto these; unmappable ones become
 * `string` with a warning, never a silent drop.
 */
export namespace ColumnSchema {

    export const Type = z.union([
        z.enum(["string", "integer", "long", "double", "boolean", "date", "timestamp", "binary"]),
        z.string().regex(/^decimal\(\d{1,2},\d{1,2}\)$/, "decimal(p,s)"),
    ])
    export type Type = z.infer<typeof Type>

    export const Column = z.object({
        name:     z.string().min(1),
        type:     Type,
        nullable: z.boolean(),
    })
    export type Column = z.infer<typeof Column>

    /**
     * How to read a view's files. Parquet describes itself; CSV needs the
     * parsing options Foundry keeps in its schema too. Every file in a view has
     * the reader's format.
     */
    export namespace Reader {
        export const Parquet = z.object({ format: z.literal("parquet") })
        export type  Parquet = z.infer<typeof Parquet>

        export const Csv = z.object({
            format:    z.literal("csv"),
            delimiter: z.string().min(1).max(4),
            quote:     z.string().max(1),           // "" = none
            escape:    z.string().max(1),
            header:    z.boolean(),                  // first row holds the column names
        })
        export type  Csv = z.infer<typeof Csv>

        export const Schema = z.discriminatedUnion("format", [Parquet, Csv])
        export type  Schema = z.infer<typeof Schema>
    }

    /** A dataset view's schema: its columns, in order, and how to read its files. Stored as catalog.transaction.schema. */
    export const Schema = z.object({
        columns: Column.array(),
        reader:  Reader.Schema,
    })
    export type  Schema = z.infer<typeof Schema>
}
