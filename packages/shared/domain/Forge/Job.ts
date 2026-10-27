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

    /**
     * `waiting` for its parents · `scheduled`: may run, not yet in Redis · `queued`: in Redis, no
     * ForgeAgent yet · `running` · finished. Airflow's names for the same steps.
     */
    export const Status = z.enum(["waiting", "scheduled", "queued", "running", "succeeded", "failed", "canceled"])
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
        scheduledAt:           z.coerce.date().nullable(),
        queuedAt:              z.coerce.date().nullable(),
        startedAt:             z.coerce.date().nullable(),
        heartbeatAt:           z.coerce.date().nullable(),
        finishedAt:            z.coerce.date().nullable(),
    })
    export type Schema = z.infer<typeof Schema>

    /** The job's output transactions, each with its dataset — how Catalog addresses them. */
    export const getOutputTransactions = (job: Pick<Schema, "outputs">): { rid: Transaction.Rid; datasetRid: Dataset.Rid }[] =>
        Object.entries(job.outputs).map(([datasetRid, rid]) => ({ rid, datasetRid: Dataset.Rid.parse(datasetRid) }))

    /** Not finished: it may still run, or is running. */
    export const UNFINISHED: readonly Status[] = ["waiting", "scheduled", "queued", "running"]
}
