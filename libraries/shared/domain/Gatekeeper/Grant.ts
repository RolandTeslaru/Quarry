import { z } from "zod"
import { Resource } from "../Library/Resource"
import { User } from "../Identity/User"
import { Group } from "../Identity/Group"
import { Role } from "./Role"

/**
 * A role on a resource for a user or a group, inherited by everything below it.
 * Identified by (resource, subject) — at most one per pair; there is no grant id.
 */
export namespace Grant {

    export const Subject = z.discriminatedUnion("type", [
        z.object({ type: z.literal("user"),  userRid:  User.Rid }),
        z.object({ type: z.literal("group"), groupRid: Group.Rid }),
    ])
    export type Subject = z.infer<typeof Subject>

    export const Schema = z.object({
        resourceRid: Resource.Rid,
        subject:     Subject,
        role:        Role.Name,
        grantedBy:   User.Rid.nullable(),
        grantedAt:   z.coerce.date(),
    })
    export type Schema = z.infer<typeof Schema>
}
