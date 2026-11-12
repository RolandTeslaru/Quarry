import { z } from "zod"
import { Foundations } from "../Foundations"
import { Dataset } from "../Dataset/Dataset"
import { Transaction } from "../Catalog/Transaction"
import { Resource } from "../Library/Resource"
import { Build } from "./Build"
import { Recipe } from "./Recipe"

/** One run of one recipe within a build: a pinned version of each input in, one version opened per output. */
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

    /** What was opened for one of its outputs when the build was created, by the output's kind. */
    export const Output = z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("dataset"), transactionRid: Transaction.Rid }),
    ])
    export type  Output = z.infer<typeof Output>

    export const Schema = z.object({
        rid:                   Rid,
        buildRid:              Build.Rid,
        recipeRid:             Recipe.Rid,
        status:                Status,
        attempt:               z.number().int().positive(),         // 1, then each retry
        inputs:                z.record(Dataset.Rid, Dataset.Sequence).nullable(),  // each input's version, pinned when it's claimed
        outputs:               z.record(Resource.Rid, Output),                       // each output's version, opened when the build is created
        failure:               z.object({ message: z.string() }).nullable(),
        scheduledAt:           z.coerce.date().nullable(),
        startedAt:             z.coerce.date().nullable(),
        heartbeatAt:           z.coerce.date().nullable(),
        finishedAt:            z.coerce.date().nullable(),
    })

    /** Its run-job message: this attempt's. */
    export const getQueueMessage = (job: Pick<Job, "rid" | "attempt">) => ({ jobRid: job.rid, attempt: job.attempt })

    /** These jobs' dataset outputs' transactions, by dataset — how Catalog addresses them. A dataset is one job's output in a build. */
    export function getOutputTransactions(jobs: Pick<Job, "outputs">[]): Record<Dataset.Rid, Transaction.Rid> {
        const transactions: Record<Dataset.Rid, Transaction.Rid> = {}

        for (const job of jobs)
            for (const rid of Object.keys(job.outputs) as Resource.Rid[]) {
                const output = job.outputs[rid]

                if (output.kind === "dataset")
                    transactions[rid as Dataset.Rid] = output.transactionRid
            }

        return transactions
    }

    /** Not finished: it may still run, or is running. */
    export const UNFINISHED: readonly Status[] = ["waiting", "scheduled", "running"]
}
export type Job = z.infer<typeof Job.Schema>
