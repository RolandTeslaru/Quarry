import { z } from "zod"
import type { ColumnSchema } from "../Catalog/ColumnSchema"
import { LinkType as LinkTypeD } from "./LinkType"
import type { ObjectType as ObjectTypeD } from "./ObjectType"
import { Property } from "./Property"

/**
 * Types checked against the datasets and object types they name (docs/design/ontology.md §6): when saved,
 * a definition must fit (`validate`, a sentence per problem); when read, each mapping gets its health,
 * since a dataset's schema can change after a type is saved (`getMappingHealth`, never stored).
 */
export namespace Validation {

    /** Whether a column, or a key, still reads as what the type says. */
    export const MappingHealth = z.enum(["ok", "missing-column", "incompatible-type"])
    export type  MappingHealth = z.infer<typeof MappingHealth>

    /** Whether a column of this type can back a property of that type. Exact matches only, for now: a `decimal` property takes any `decimal(p,s)`. */
    export function isCompatible(type: Property.Type, columnType: ColumnSchema.Type): boolean {
        if (type === "decimal")
            return columnType.startsWith("decimal(")

        return type === columnType
    }

    /** A column of a dataset's schema read as a property of this type. No schema (no data, raw files, no access) reads as missing. */
    export function getColumnHealth(type: Property.Type, column: string, schema: ColumnSchema | null): MappingHealth {
        if (!schema)
            return "missing-column"

        for (const candidate of schema.columns)
            if (candidate.name === column)
                return isCompatible(type, candidate.type) ? "ok" : "incompatible-type"

        return "missing-column"
    }

    export namespace ObjectType {

        /** Each property's health, against the backing dataset's schema. */
        export const MappingHealth = z.record(Property.ApiName, Validation.MappingHealth)
        export type  MappingHealth = z.infer<typeof MappingHealth>

        export function getMappingHealth(objectType: Pick<ObjectTypeD, "properties">, schema: ColumnSchema | null): MappingHealth {
            const health: MappingHealth = {}

            for (const apiName of Object.keys(objectType.properties)) {
                const property = objectType.properties[apiName]

                health[apiName] = getColumnHealth(property.type, property.column, schema)
            }

            return health
        }

        /**
         * Why a definition can't be saved against its backing dataset's schema, one sentence each; none if it
         * can. The data itself (a unique, non-null primary key) is the indexer's business.
         */
        export function validate(definition: Pick<ObjectTypeD, "primaryKey" | "titleProperty" | "properties">, schema: ColumnSchema | null): string[] {
            const problems: string[] = []

            if (!schema)
                problems.push("The backing dataset has no columns: it has no data yet, holds raw files, or can't be read")

            const health = getMappingHealth(definition, schema)

            for (const apiName of Object.keys(health)) {
                const column = definition.properties[apiName].column

                if (schema && health[apiName] === "missing-column")
                    problems.push(`${apiName}: the backing dataset has no column ${column}`)

                if (health[apiName] === "incompatible-type")
                    problems.push(`${apiName}: column ${column} isn't a ${definition.properties[apiName].type}`)
            }

            const primaryKey = definition.properties[definition.primaryKey]

            if (!primaryKey)
                problems.push(`The primary key ${definition.primaryKey} isn't one of its properties`)
            else if (!Property.PRIMARY_KEY_TYPES.includes(primaryKey.type))
                problems.push(`The primary key ${definition.primaryKey} is a ${primaryKey.type}: it must be a ${Property.PRIMARY_KEY_TYPES.join(", ")}`)

            if (!definition.properties[definition.titleProperty])
                problems.push(`The title ${definition.titleProperty} isn't one of its properties`)

            return problems
        }
    }

    export namespace LinkType {

        /**
         * The health of what backs it: the foreign key (`foreignKey`), or the join dataset's columns or the
         * intermediary type's foreign keys (`a`, `b`).
         */
        export const MappingHealth = z.partialRecord(z.enum(["a", "b", "foreignKey"]), Validation.MappingHealth)
        export type  MappingHealth = z.infer<typeof MappingHealth>

        /** What a link type is checked against: the object types it names that the reader can see, and its join dataset's schema. */
        export interface Context {
            objectTypes:       Record<ObjectTypeD.Rid, ObjectTypeD>
            joinDatasetSchema: ColumnSchema | null
        }

        /** What backs the link, checked against the object types and dataset it names now. One that's missing reads as missing. */
        export function getMappingHealth(definition: Pick<LinkTypeD, "sides" | "backing">, context: Context): MappingHealth {
            const health: MappingHealth = {}
            const keyTypes: Partial<Record<LinkTypeD.SideKey, Property.Type>> = {}

            // Each side's primary key type: what the backing must hold.
            for (const side of LinkTypeD.SideKey.options) {
                const objectType = context.objectTypes[definition.sides[side].objectTypeRid]
                const key = objectType?.properties[objectType.primaryKey]

                if (key)
                    keyTypes[side] = key.type
            }

            const backing = definition.backing

            if (backing.kind === "foreign-key") {
                const holder = context.objectTypes[definition.sides[backing.foreignKey.side].objectTypeRid]
                const property = holder?.properties[backing.foreignKey.property]

                health.foreignKey = getKeyHealth(property, keyTypes[LinkTypeD.getOtherSide(backing.foreignKey.side)])
            }

            if (backing.kind === "dataset")
                for (const side of LinkTypeD.SideKey.options) {
                    const keyType = keyTypes[side]

                    if (keyType)
                        health[side] = getColumnHealth(keyType, backing.columns[side], context.joinDatasetSchema)
                    else
                        health[side] = "missing-column"
                }

            if (backing.kind === "object") {
                const intermediary = context.objectTypes[backing.objectTypeRid]

                for (const side of LinkTypeD.SideKey.options)
                    health[side] = getKeyHealth(intermediary?.properties[backing.foreignKeys[side]], keyTypes[side])
            }

            return health
        }

        /** Whether a property holds keys of this type: it, or the key, missing reads as missing. */
        function getKeyHealth(property: Property | undefined, keyType: Property.Type | undefined): Validation.MappingHealth {
            if (!property || !keyType)
                return "missing-column"

            if (property.type !== keyType)
                return "incompatible-type"

            return "ok"
        }

        /**
         * Why a definition can't be saved, one sentence each; none if it can. `takenApiNames`: each object type's
         * link-side API names from its other link types — its properties' come from `context.objectTypes`.
         */
        export function validate(
            definition:    Pick<LinkTypeD, "sides" | "backing">,
            context:       Context,
            takenApiNames: Record<ObjectTypeD.Rid, Set<string>>,
        ): string[] {
            const problems: string[] = []
            const { sides, backing } = definition

            if (backing.kind === "foreign-key" && sides[backing.foreignKey.side].cardinality !== "one")
                problems.push(`Side ${backing.foreignKey.side} holds the foreign key, so it leads to one object`)

            if (backing.kind !== "foreign-key" && (sides.a.cardinality !== "many" || sides.b.cardinality !== "many"))
                problems.push("A link backed by a join dataset or an intermediary object type leads to many objects on both sides")

            if (sides.a.objectTypeRid === sides.b.objectTypeRid && sides.a.apiName === sides.b.apiName)
                problems.push(`Both sides of a link from an object type to itself are named ${sides.a.apiName}`)

            // A side's name sits beside its object type's properties and other links: `officer.entities` means one thing.
            for (const side of LinkTypeD.SideKey.options) {
                const { objectTypeRid, apiName } = sides[side]

                if (takenApiNames[objectTypeRid]?.has(apiName))
                    problems.push(`Side ${side}: another link of its object type is already named ${apiName}`)

                if (context.objectTypes[objectTypeRid]?.properties[apiName])
                    problems.push(`Side ${side}: its object type has a property named ${apiName}`)
            }

            const health = getMappingHealth(definition, context)

            for (const key of Object.keys(health) as (keyof MappingHealth)[]) {
                if (health[key] === "missing-column")
                    problems.push(`${key}: not there, or the side's object type has no primary key`)

                if (health[key] === "incompatible-type")
                    problems.push(`${key}: not the same type as the primary key it points at`)
            }

            return problems
        }
    }
}
