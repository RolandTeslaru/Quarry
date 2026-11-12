import { z } from "zod"
import { Foundations } from "../Foundations"
import { Resource } from "../Library/Resource"
import { Dataset } from "../Dataset/Dataset"
import { Ontology } from "./Ontology"
import { Property } from "./Property"

/** A kind of thing, backed by one dataset: one row is one object (docs/design/ontology.md §4). A library resource. */
export namespace ObjectType {

    export type  Rid = Foundations.Rid<"ontology", "object-type">
    export const Rid = Foundations.Rid.generateSchema("ontology", "object-type")
    export const createRid = () => Foundations.Rid.create("ontology", "object-type")

    /** PascalCase, singular, unique within the ontology: `OffshoreEntity`. */
    export const ApiName = z.string()
        .max(100)
        .regex(/^[A-Z][A-Za-z0-9]*$/, "An object type's API name is PascalCase: a capital letter, then letters and digits")
    export type  ApiName = z.infer<typeof ApiName>

    /** How apps show it: an icon from standard-ui and a palette token, never a hex value. */
    export const Ui = z.object({
        icon:  z.string().min(1),
        color: z.string().min(1),
    })
    export type  Ui = z.infer<typeof Ui>

    export const Schema = Resource.Base.extend({
        rid:               Rid,
        type:              z.literal("object-type"),
        parentRid:         Resource.Rid,
        ontologyRid:       Ontology.Rid,
        apiName:           ApiName,
        pluralDisplayName: z.string().min(1),       // the singular one is the resource's name
        ui:                Ui,
        backingDatasetRid: Dataset.Rid,
        primaryKey:        Property.ApiName,         // the property that identifies an object
        titleProperty:     Property.ApiName,         // the property shown as an object's title
        properties:        z.record(Property.ApiName, Property.Schema),    // in display order
    })
}
export type ObjectType = z.infer<typeof ObjectType.Schema>
