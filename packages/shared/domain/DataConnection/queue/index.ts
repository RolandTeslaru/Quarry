import { z } from "zod"
import { Foundations } from "../../Foundations"
import { User } from "../../Identity/User"
import { Transaction } from "../../Catalog/Transaction"
import { Credential } from "../../Keychain/Credential"
import { Source as SourceD } from "../Source"
import { Sync as SyncD } from "../Sync"
import { SyncRun as SyncRunD } from "../SyncRun"

/**
 * Data Connection's background-job contracts — between the processes, as
 * `API` is between browser and server. The runtime (QueueManager, processors)
 * is in the server, as are timeouts and cadences. See docs/design/jobs.md.
 */
export namespace Queue {

    /** One sync run. Consumed by the Data Connection worker. */
    export namespace Sync {
        export const Job = z.object({
            syncRid:      SyncD.Rid,
            trigger:     SyncRunD.Trigger,
            triggeredBy: User.Rid.nullable(),
        })
        export type Job = z.infer<typeof Job>

        export const Result = z.object({
            syncRunRid:     SyncRunD.Rid.nullable(),                // null if skipped
            transactionRid: Transaction.Rid.nullable(),
            rowCount:       z.number().int(),
            skipped:        z.boolean(),
        })
        export type Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "data-connection.sync",
            job:     Job,
            result:  Result,
            options: {
                attempts:         3,
                backoff:          { type: "exponential", delay: 30_000 },
                removeOnComplete: 1_000,
                removeOnFail:     1_000,
            },
        })

        /** At most one waiting or active job per sync — every producer must pass this. */
        export const deduplication = (syncRid: SyncD.Rid) => ({ id: `sync:${syncRid}` })
    }

    /**
     * Connection test / table exploration. Request-reply from the API; consumed by
     * the Data Connection worker, which opens the source's runtime: test = open → close,
     * explore = open → explore → close.
     */
    export namespace SourceProbe {
        /**
         * The source as the server loaded it (after its permission checks), with its
         * credential still encrypted — Redis never sees credential values.
         */
        const Base = z.object({
            source:     z.object({ rid: SourceD.Rid, definitionId: SourceD.DefinitionId, config: SourceD.Config }),
            credential: Credential.Encrypted.nullable(),
        })

        export const Job = z.discriminatedUnion("op", [
            Base.extend({ op: z.literal("test") }),
            Base.extend({ op: z.literal("explore") }),
        ])
        export type Job = z.infer<typeof Job>

        export const Result = z.discriminatedUnion("op", [
            z.object({ op: z.literal("test"),    ok: z.boolean(), error: z.string().nullable() }),
            z.object({ op: z.literal("explore"), tables: SourceD.Table.array() }),
        ])
        export type Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "data-connection.source-probe",
            job:     Job,
            result:  Result,
            options: { attempts: 1, removeOnComplete: { age: 60 }, removeOnFail: { age: 600 } },
        })
    }

    /** Fails runs whose worker died. Singleton, system worker. */
    export namespace SyncReaper {
        export const Result = z.object({ reaped: z.number().int() })
        export type  Result = z.infer<typeof Result>

        export const Definition = Foundations.Queue.define({
            name:    "data-connection.sync-reaper",
            job:     z.object({}),
            result:  Result,
            options: { removeOnComplete: 50, removeOnFail: 50 },
        })
    }
}
