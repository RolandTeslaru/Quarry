import { z } from "zod"
import { Foundations } from "../Foundations"
import { User } from "../Identity/User"

// A file in the Library: anything with a RID, a name and a place in the tree.
// Library owns these shared fields; each owning service extends them.
export namespace Resource {

    /** Mirrors library.resource_type. */
    export const Type = z.enum(["project", "folder", "dataset", "source", "credential", "workspace"])
    export type  Type = z.infer<typeof Type>

    export const CONTAINERS: readonly Type[] = ["project", "folder"]

    /** Any library resource's RID — what Gatekeeper accepts. */
    export type  Rid = Foundations.Rid<string, Type>
    export const Rid = Foundations.Rid.ofTypes(Type.options)

    /** The fields every resource has, whatever its type. Subtypes extend this. */
    export const Base = z.object({
        rid:         Rid,
        type:        Type,
        name:        z.string(),
        description: z.string().nullable(),
        parentRid:   Rid.nullable(),
        createdBy:   User.Rid.nullable(),              // null = the system acted
        createdAt:   z.coerce.date(),
        updatedAt:   z.coerce.date(),
        trashedAt:   z.coerce.date().nullable(),
    })
    export type Base = z.infer<typeof Base>

    /** No slashes: names are path segments. */
    export const Name = z.string().trim().min(1).max(255).regex(/^[^/]+$/, "Names cannot contain '/'")

    /** A resource's library path from its path (root first, itself last): `/Project/folder/name`. */
    export const getPath = (path: readonly Pick<Base, "name">[]): string =>
        `/${path.map(resource => resource.name).join("/")}`

    /** `/Project/folder/name` → its names, root first. */
    export const parsePath = (path: string): string[] =>
        path.split("/").filter(name => name.length > 0)
}
