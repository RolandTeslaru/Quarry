import { z } from "zod"
import { Foundations } from "../Foundations"
import { Resource } from "./Resource"

export namespace Folder {

    export type  Rid = Foundations.Rid<"library", "folder">
    export const Rid = Foundations.Rid.generateSchema("library", "folder")
    export const createRid = () => Foundations.Rid.create("library", "folder")

    export const Schema = Resource.Base.extend({
        rid:       Rid,
        type:      z.literal("folder"),
        parentRid: Resource.Rid,
    })
    export type Schema = z.infer<typeof Schema>
}
