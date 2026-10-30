import { z } from "zod"

/** A branch name, shared by everything branched — dataset branches, recipes, builds, Git. Matched by name. */
export const Branch = z.string()
    // Git's rules, roughly: no leading '-', no '..', no '//', no trailing '/' or '.lock'.
    .regex(/^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]+(?<!\/)(?<!\.lock)$/, "Not a valid branch name")
    .brand("Foundations.Branch")
export type Branch = z.infer<typeof Branch>

/** Every dataset's and workspace's first branch, and the only one builds run on so far. */
export const MAIN_BRANCH = Branch.parse("main")
