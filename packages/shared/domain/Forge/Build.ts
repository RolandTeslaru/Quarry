import { z } from "zod"
import { Foundations } from "../Foundations"
import { Dataset } from "../Catalog/Dataset"
import { User } from "../Identity/User"

/** One request to bring datasets up to date on a branch: the jobs it resolved to, run in dependency order. */
export namespace Build {

    /** A RID, but not a library resource. */
    export type  Rid = Foundations.Rid<"forge", "build">
    export const Rid = Foundations.Rid.generateSchema("forge", "build")
    export const createRid = () => Foundations.Rid.create("forge", "build")

    /** Which datasets to build — Foundry's three scopes. */
    export const Target = z.discriminatedUnion("type", [
        // Exactly these — their own jobs, inputs as they are. What a Build button does.
        z.object({ type: z.literal("manual"),     datasetRids: Dataset.Rid.array().min(1) }),
        // These and every out-of-date ancestor.
        z.object({ type: z.literal("upstream"),   datasetRids: Dataset.Rid.array().min(1) }),
        // Only what lies between the inputs and the targets.
        z.object({ type: z.literal("connecting"), inputRids:   Dataset.Rid.array().min(1), datasetRids: Dataset.Rid.array().min(1) }),
    ])
    export type Target = z.infer<typeof Target>

    export const Status = z.enum(["running", "succeeded", "failed", "canceled"])
    export type  Status = z.infer<typeof Status>

    export const Schema = z.object({
        rid:              Rid,
        branch:           Foundations.Branch,
        fallbackBranches: Foundations.Branch.array(),   // where to find job specs and inputs the branch hasn't got, in order
        target:           Target,
        forceBuild:       z.boolean(),                  // build fresh outputs too
        abortOnFailure:   z.boolean(),                  // a failed job cancels the rest, not just its downstream
        retryCount:       z.number().int().nonnegative(),
        status:           Status,
        createdBy:        User.Rid.nullable(),          // null = the system
        createdAt:        z.coerce.date(),
        finishedAt:       z.coerce.date().nullable(),
    })
    export type Schema = z.infer<typeof Schema>
}
