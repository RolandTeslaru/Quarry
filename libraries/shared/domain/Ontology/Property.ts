import { z } from "zod"

/** A field of an object type, mapped from a column of its backing dataset (docs/design/ontology.md §4). Part of its object type, not a resource. */
export namespace Property {

    /** Names the API itself uses for an object's own fields. */
    export const RESERVED: readonly string[] = ["rid", "primaryKey", "ontology", "objectType", "title"]

    /** camelCase, unique within its object type: `incorporationDate`. */
    export const ApiName = z.string()
        .max(100)
        .regex(/^[a-z][A-Za-z0-9]*$/, "A property's API name is camelCase: a lowercase letter, then letters and digits")
        .refine((name) => !RESERVED.includes(name), "This API name is reserved")
    export type  ApiName = z.infer<typeof ApiName>

    /** An ontology type, not the column's: a `decimal` property takes any `decimal(p,s)` column. */
    export const Type = z.enum(["string", "integer", "long", "double", "decimal", "boolean", "date", "timestamp"])
    export type  Type = z.infer<typeof Type>

    /** What a primary key may be. */
    export const PRIMARY_KEY_TYPES: readonly Type[] = ["string", "integer", "long"]

    export const Schema = z.object({
        displayName: z.string().min(1),
        description: z.string().nullable(),
        type:        Type,
        column:      z.string().min(1),           // in the backing dataset
    })
}
export type Property = z.infer<typeof Property.Schema>
