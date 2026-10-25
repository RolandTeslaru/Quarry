import { z } from "zod"

/** A Git commit in a workspace's repository: its full SHA-1. */
export const Commit = z.string()
    .regex(/^[0-9a-f]{40}$/, "Not a commit SHA")
    .brand("CodeWorkspace.Commit")
export type Commit = z.infer<typeof Commit>
