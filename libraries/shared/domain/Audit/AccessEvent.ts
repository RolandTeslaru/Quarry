import { z } from "zod"
import { User } from "../Identity/User"
import { Resource } from "../Library/Resource"
import { Application } from "../Platform/Application"

// One access to one resource — append-only, never edited. See docs/design/audit.md.
export namespace AccessEvent {

    /** Mirrors audit.access_event.action. */
    export const Action = z.enum(["open", "read", "download", "modify", "reveal", "denied"])
    export type  Action = z.infer<typeof Action>

    export const Schema = z.object({
        id:            z.coerce.number().int(),
        at:            z.coerce.date(),
        userRid:       User.Rid,                           // whose access — a delegate's user
        via:           z.string().nullable(),              // what acted for them (`sync:<id>`); null = the user directly
        resourceRid:   z.string(),                         // not Resource.Rid: the resource may be gone
        resourceType:  z.string(),
        action:        Action,
        applicationId: Application.Id.nullable(),          // only on open
        detail:        z.record(z.string(), z.unknown()),
    })
    export type Schema = z.infer<typeof Schema>

    /** A resource the caller opened recently in one app: the resource, where it sits, when. */
    export const Recent = z.object({
        resource:   Resource.Base,
        parentName: z.string().nullable(),
        openedAt:   z.coerce.date(),
    })
    export type Recent = z.infer<typeof Recent>
}
