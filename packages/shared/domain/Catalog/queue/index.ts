import { z } from "zod"
import { Foundations } from "../../Foundations"
import { Dataset as DatasetD } from "../Dataset"
import { Transaction as TransactionD } from "../Transaction"

/**
 * Catalog's background-job contracts — between the processes, as `API` is
 * between browser and server. The runtime (QueueManager, processors) is in
 * the server, as are scheduling cadences. See docs/design/jobs.md.
 */
export namespace Queue {

    /** Relays catalog.outbox rows into BullMQ. Singleton, system worker. */
    export namespace OutboxRelay {
        export const Result = z.object({ published: z.number().int() })
        export type  Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "catalog.outbox-relay",
            job:     z.object({}),
            result:  Result,
            options: { removeOnComplete: 100, removeOnFail: 100 },
        })
    }

    /** Aborts stale open transactions and deletes the files of aborted ones. Singleton, system worker. */
    export namespace StorageGc {
        export const Result = z.object({ aborted: z.number().int(), filesDeleted: z.number().int() })
        export type  Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "catalog.storage-gc",
            job:     z.object({}),
            result:  Result,
            options: { removeOnComplete: 50, removeOnFail: 50 },
        })
    }

    /** A dataset branch got a new committed transaction. No consumer yet — builds (layer 2), reindexing (layer 3). */
    export namespace DatasetUpdated {
        export const Job = z.object({
            datasetRid:     DatasetD.Rid,
            branch:         z.string(),
            sequence:       z.number().int(),
            transactionRid: TransactionD.Rid,
        })
        export type Job = z.infer<typeof Job>

        export const Definition = Foundations.Queue.define({
            name:    "catalog.dataset-updated",
            job:     Job,
            result:  z.void(),
            options: { removeOnComplete: 1_000, removeOnFail: 1_000 },
        })
    }
}
