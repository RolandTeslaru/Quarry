import { z } from "zod"
import { Foundations } from "../Foundations"

// A member of this workspace. Credentials are GoTrue's; having a row here is
// what makes someone a member.
export namespace User {

    /** `ri.identity.main.user.<GoTrue user id>` — wraps the `sub` of GoTrue's JWTs, one-to-one. */
    export type  Rid = Foundations.Rid<"identity", "user">
    export const Rid = Foundations.Rid.generateSchema("identity", "user")

    /** The user RID for a GoTrue user id (a JWT's `sub`). */
    export const fromAuthId = (authId: string): Rid => Foundations.Rid.withLocator("identity", "user", authId)

    export const WorkspaceRole = z.enum(["member", "admin"])
    export type  WorkspaceRole = z.infer<typeof WorkspaceRole>

    export const Schema = z.object({
        rid:           Rid,
        email:         z.email(),
        displayName:   z.string(),
        workspaceRole: WorkspaceRole,
        createdAt:     z.coerce.date(),
        deactivatedAt: z.coerce.date().nullable(),
    })
    export type Schema = z.infer<typeof Schema>
}
