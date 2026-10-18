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

    /** Ordered column list of a dataset view. Stored as catalog.transaction.schema. */
    export const Schema = Column.array()
    export type  Schema = z.infer<typeof Schema>
}
