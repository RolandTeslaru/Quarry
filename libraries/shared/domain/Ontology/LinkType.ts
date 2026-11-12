import { z } from "zod"
import { Foundations } from "../Foundations"
import { Resource } from "../Library/Resource"
import { Dataset } from "../Dataset/Dataset"
import { Ontology } from "./Ontology"
import { ObjectType } from "./ObjectType"
import { Property } from "./Property"

/**
 * A relationship between two object types (docs/design/ontology.md §5). A library resource. Read in both
 * directions, so it has two sides; its backing says where the pairs come from. A link always points at
 * the other side's primary key.
 */
export namespace LinkType {

    export type  Rid = Foundations.Rid<"ontology", "link-type">
    export const Rid = Foundations.Rid.generateSchema("ontology", "link-type")
    export const createRid = () => Foundations.Rid.create("ontology", "link-type")

    /** camelCase: `operative.loadout`. Unique among its object type's link sides and properties. */
    export const ApiName = z.string()
        .max(100)
        .regex(/^[a-z][A-Za-z0-9]*$/, "A link's API name is camelCase: a lowercase letter, then letters and digits")
    export type  ApiName = z.infer<typeof ApiName>

    /** `a` and `b`, not object types: a self-link has the same object type on both. */
    export const SideKey = z.enum(["a", "b"])
    export type  SideKey = z.infer<typeof SideKey>

    export const getOtherSide = (side: SideKey): SideKey => side === "a" ? "b" : "a"

    /** The link seen from one of its object types: what you get going from it — one object, or many. */
    export namespace Side {

        export const Cardinality = z.enum(["one", "many"])
        export type  Cardinality = z.infer<typeof Cardinality>

        export const Schema = z.object({
            objectTypeRid: ObjectType.Rid,
            displayName:   z.string().min(1),
            apiName:       ApiName,
            cardinality:   Cardinality,
        })
    }

    export type Side = z.infer<typeof Side.Schema>

    /** Where the pairs come from. Each names only what varies: what it points at is always the other side's primary key. */
    export namespace Backing {

        /** A property on one side holds the other side's primary key. That side is `one`; the other is `many`, or `one` for one-to-one. */
        export const ForeignKey = z.object({
            kind:       z.literal("foreign-key"),
            foreignKey: z.object({ side: SideKey, property: Property.ApiName }),
        })

        /** A join dataset with a column per side, each holding that side's primary key. Both sides `many`. */
        export const JoinDataset = z.object({
            kind:       z.literal("dataset"),
            datasetRid: Dataset.Rid,
            columns:    z.object({ a: z.string().min(1), b: z.string().min(1) }),
        })

        /**
         * An intermediary object type whose objects join the two sides: `foreignKeys` names its property holding
         * each side's primary key. Its other properties are the link's own — how a link gets properties. Both sides `many`.
         */
        export const IntermediaryObject = z.object({
            kind:          z.literal("object"),
            objectTypeRid: ObjectType.Rid,
            foreignKeys:   z.object({ a: Property.ApiName, b: Property.ApiName }),
        })

        export const Schema = z.discriminatedUnion("kind", [ForeignKey, JoinDataset, IntermediaryObject])
    }

    export type Backing = z.infer<typeof Backing.Schema>

    export const Schema = Resource.Base.extend({
        rid:         Rid,
        type:        z.literal("link-type"),
        parentRid:   Resource.Rid,
        ontologyRid: Ontology.Rid,
        sides:       z.object({ a: Side.Schema, b: Side.Schema }),
        backing:     Backing.Schema,
    })

    /** The object types a definition names: its sides', and its intermediary's. */
    export function getObjectTypeRids(definition: Pick<LinkType, "sides" | "backing">): ObjectType.Rid[] {
        const rids = new Set<ObjectType.Rid>([definition.sides.a.objectTypeRid, definition.sides.b.objectTypeRid])

        if (definition.backing.kind === "object")
            rids.add(definition.backing.objectTypeRid)

        return [...rids]
    }
}
export type LinkType = z.infer<typeof LinkType.Schema>
