import { z } from "zod"

/** Mirrors gatekeeper.role. A higher role includes everything below it. */
export namespace Role {

    export const Name = z.enum(["discoverer", "viewer", "editor", "owner"])
    export type  Name = z.infer<typeof Name>

    export const RANK: Record<Name, Rank> = { discoverer: 1, viewer: 2, editor: 3, owner: 4 }

    /** 0 = no access; 4 = owner. */
    export type Rank = 0 | 1 | 2 | 3 | 4
}
