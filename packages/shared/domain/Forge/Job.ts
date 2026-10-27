import { z } from "zod"
import { Foundations } from "../Foundations"
import { Dataset } from "../Catalog/Dataset"
import { Transaction } from "../Catalog/Transaction"
import { Build } from "./Build"
import { JobSpec } from "./JobSpec"

/** One run of one job spec within a build: a pinned version of each input in, one transaction per output. */
export namespace Job {

    /** A RID, but not a library resource. */
    export type  Rid = Foundations.Rid<"forge", "job">
    export const Rid = Foundations.Rid.generateSchema("forge", "job")
    export const createRid = () => Foundations.Rid.create("forge", "job")

    /** `waiting` for its upstream jobs; `canceled` when one of them failed, or the build was canceled. */
    export const Status = z.enum(["waiting", "running", "succeeded", "failed", "canceled"])
    export type  Status = z.infer<typeof Status>

    export const Schema = z.object({
        rid:                   Rid,
        buildRid:              Build.Rid,
        jobSpecRid:            JobSpec.Rid,
        status:                Status,
        attempt:               z.number().int().positive(),         // 1, then each retry
        inputs:                z.record(Dataset.Rid, Transaction.Rid).nullable(),   // the version of each input it read, pinned when it starts
        outputs:               z.record(Dataset.Rid, Transaction.Rid),              // each output's transaction, opened when the build is created
        failure:               z.object({ message: z.string() }).nullable(),
        startedAt:             z.coerce.date().nullable(),
        finishedAt:            z.coerce.date().nullable(),
    })
    export type Schema = z.infer<typeof Schema>
}
