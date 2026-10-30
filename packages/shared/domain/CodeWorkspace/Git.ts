import { z } from "zod"
import { Foundations } from "../Foundations"

/** A workspace's Git repository, as Quarry talks about it: commits, branch heads, authors. */
export namespace Git {

    /** A commit: its full SHA-1. */
    export const Commit = z.string()
        .regex(/^[0-9a-f]{40}$/, "Not a commit SHA")
        .brand("CodeWorkspace.Git.Commit")
    export type Commit = z.infer<typeof Commit>

    /** Every branch's head — the commit it points to now (`refs/heads/<branch>`). */
    export const Heads = z.record(Foundations.Branch, Commit)
    export type  Heads = z.infer<typeof Heads>

    /** Who a commit is by. */
    export const Author = z.object({
        name:  z.string(),
        email: z.email(),
    })
    export type Author = z.infer<typeof Author>

    /** The branches a push created or moved, at their new heads. Deleted branches aren't in it — they run nothing. */
    export const getMovedHeads = (before: Heads, after: Heads): Heads =>
        Object.fromEntries(
            Object.entries(after).filter(([branch, commit]) => before[branch as Foundations.Branch] !== commit),
        ) as Heads
}
