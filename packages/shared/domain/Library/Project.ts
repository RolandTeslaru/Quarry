import { z } from "zod"
import { Foundations } from "../Foundations"
import { Resource } from "./Resource"

/** A root of the tree. Permissions are usually granted here. */
export namespace Project {

    export type  Rid = Foundations.Rid<"library", "project">
    export const Rid = Foundations.Rid.generateSchema("library", "project")
    export const createRid = () => Foundations.Rid.create("library", "project")

    export const Schema = Resource.Base.extend({
        rid:       Rid,
        type:      z.literal("project"),
        parentRid: z.null(),
    })
    export type Schema = z.infer<typeof Schema>
}
