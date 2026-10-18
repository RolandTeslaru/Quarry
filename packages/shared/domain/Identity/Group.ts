import { z } from "zod"
import { Foundations } from "../Foundations"
import { User } from "./User"

export namespace Group {

    /** `ri.identity.main.group.<uuidv7>` — a principal grants can be given to; not a library resource. */
    export type  Rid = Foundations.Rid<"identity", "group">
    export const Rid = Foundations.Rid.generateSchema("identity", "group")
    export const createRid = () => Foundations.Rid.create("identity", "group")

    export const Schema = z.object({
        rid:         Rid,
        name:        z.string(),
        description: z.string().nullable(),
        createdAt:   z.coerce.date(),
    })
    export type Schema = z.infer<typeof Schema>

    export const Member = z.object({
        groupRid: Rid,
        userRid:  User.Rid,
        addedAt:  z.coerce.date(),
    })
    export type Member = z.infer<typeof Member>
}
