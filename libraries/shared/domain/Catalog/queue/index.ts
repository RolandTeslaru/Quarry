import { z } from "zod"
import { Foundations } from "../../Foundations"

/**
 * Catalog's background-job contracts — between the processes, as `API` is
 * between browser and server. The runtime (QueueManager, processors) is in
 * the server, as are scheduling cadences. See docs/design/jobs.md.
 */
export namespace Queue {

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
}
