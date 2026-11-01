import { z } from "zod"
import { Role } from "./Role"

/** What services check. Each action needs a minimum rank. */
export namespace Action {

    export const Name = z.enum(["discover", "read", "write", "manage"])
    export type  Name = z.infer<typeof Name>

    export const MINIMUM_RANK: Record<Name, Role.Rank> = { discover: 1, read: 2, write: 3, manage: 4 }

    export const isAllowed = (rank: Role.Rank, action: Name) => rank >= MINIMUM_RANK[action]
}
