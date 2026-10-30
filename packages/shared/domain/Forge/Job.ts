import { z } from "zod"
import { Foundations } from "../Foundations"
import { Dataset } from "../Dataset/Dataset"
import { Transaction } from "../Catalog/Transaction"
import { Build } from "./Build"
import { Recipe } from "./Recipe"

/** One run of one recipe within a build: a pinned version of each input in, one transaction per output. */
export namespace Job {

    /** A RID, but not a library resource. */
    export type  Rid = Foundations.Rid<"forge", "job">
    export const Rid = Foundations.Rid.generateSchema("forge", "job")
    export const createRid = () => Foundations.Rid.create("forge", "job")

    /**
     * `waiting` for its parents · `scheduled`: may run — its message is in the outbox, then Redis,
     * until a ForgeAgent starts it · `running` · finished. Airflow's names for the same steps
     * (whether the message is in Redis is the durable queue's, not the job's).
     */
    export const Status = z.enum(["waiting", "scheduled", "running", "succeeded", "failed", "canceled"])
    export type  Status = z.infer<typeof Status>

    export const Schema = z.object({
        rid:                   Rid,
        buildRid:              Build.Rid,
        recipeRid:             Recipe.Rid,
        status:                Status,
        attempt:               z.number().int().positive(),         // 1, then each retry
        inputs:                z.record(Dataset.Rid, Dataset.Sequence).nullable(),  // each input's version, pinned when it's claimed
        outputs:               z.record(Dataset.Rid, Transaction.Rid),              // each output's transaction, opened when the build is created
        failure:               z.object({ message: z.string() }).nullable(),
        scheduledAt:           z.coerce.date().nullable(),
        startedAt:             z.coerce.date().nullable(),
        heartbeatAt:           z.coerce.date().nullable(),
        finishedAt:            z.coerce.date().nullable(),
    })
    export type Schema = z.infer<typeof Schema>

    /** Its run-job message: this attempt's. */
    export const getMessage = (job: Pick<Schema, "rid" | "attempt">) => ({ jobRid: job.rid, attempt: job.attempt })

    /** The job's output transactions, each with its dataset — how Catalog addresses them. */
    export function getOutputTransactions(job: Pick<Schema, "outputs">): { rid: Transaction.Rid; datasetRid: Dataset.Rid }[] {
        const transactions: { rid: Transaction.Rid; datasetRid: Dataset.Rid }[] = []

        for (const datasetRid of Object.keys(job.outputs) as Dataset.Rid[])
            transactions.push({ rid: job.outputs[datasetRid], datasetRid })

        return transactions
    }

    /** Not finished: it may still run, or is running. */
    export const UNFINISHED: readonly Status[] = ["waiting", "scheduled", "running"]
}
