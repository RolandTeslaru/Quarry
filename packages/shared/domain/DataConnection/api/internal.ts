import { z } from "zod"
import type { AxiosInstance } from "axios"
import { User } from "../../Identity/User"
import { ColumnSchema } from "../../Catalog/ColumnSchema"
import { Dataset as DatasetD } from "../../Dataset/Dataset"
import { Transaction as TransactionD } from "../../Catalog/Transaction"
import { Credential } from "../../Keychain/Credential"
import { Source as SourceD } from "../Source"
import { Sync as SyncD } from "../Sync"
import { SyncRun as SyncRunD } from "../SyncRun"

/**
 * Server endpoints only the workers call (`/api/internal/…`, service token).
 * Workers never touch Postgres: everything about a run's rows, its dataset
 * transaction and permissions happens here, in the server.
 */
export namespace Internal {

    /** Data Connection worker: begin a run — the server records it and opens the dataset transaction. */
    export namespace StartRun {
        export const Request = z.object({
            syncRid:     SyncD.Rid,
            trigger:     SyncRunD.Trigger,
            triggeredBy: User.Rid.nullable(),
        })
        export type Request = z.infer<typeof Request>

        export const Response = z.discriminatedUnion("skipped", [
            z.object({ skipped: z.literal(true) }),                 // sync gone or disabled
            z.object({
                skipped:        z.literal(false),
                runRid:         SyncRunD.Rid,
                datasetRid:     DatasetD.Rid,
                transactionRid: TransactionD.Rid,
                source:         SourceD.Schema,
                credential:     Credential.Encrypted.nullable(),    // null iff the source's definition takes none
                syncConfig:     SyncD.Config,
                state:          z.string().nullable(),              // the previous successful run's stateTo
                destination:    z.string(),                         // s3://bucket/<dataset>/<transaction>/
            }),
        ])
        export type Response = z.infer<typeof Response>
    }

    /** Data Connection worker: the copy finished — the server registers the files under the prefix and commits. */
    export namespace CompleteRun {
        export const Request = z.object({
            rowCount:  z.number().int().nonnegative(),
            state:     z.string().nullable(),                         // what the next run starts from
            schema:    ColumnSchema.Schema.nullable(),
            rowCounts: z.record(z.string(), z.number().int().nonnegative()),   // object key → rows, from the Parquet footers
        })
        export type Request = z.infer<typeof Request>

        export const Response = z.object({ transactionRid: TransactionD.Rid, files: z.number().int() })
        export type Response = z.infer<typeof Response>
    }

    /** Data Connection worker: the run failed — the server aborts the transaction and fails the run. */
    export namespace FailRun {
        export const Request = z.object({ message: z.string() })
        export type Request = z.infer<typeof Request>
    }

    /** System worker: fail runs whose heartbeat is older than `staleMinutes`, abort their transactions. */
    export namespace ReapRuns {
        export const Request  = z.object({ staleMinutes: z.number().int().positive() })
        export type  Request  = z.infer<typeof Request>
        export const Response = z.object({ reaped: z.number().int() })
        export type  Response = z.infer<typeof Response>
    }

    /** System worker: every enabled sync with a schedule — what BullMQ's job schedulers should mirror. */
    export namespace ScheduledSyncs {
        export const Response = z.object({ syncs: z.object({ rid: SyncD.Rid, schedule: z.string() }).array() })
        export type  Response = z.infer<typeof Response>
    }

    export async function startRun(api: AxiosInstance, req: StartRun.Request): Promise<StartRun.Response> {
        const { data } = await api.post("/api/internal/sync-runs", req)
        return StartRun.Response.parse(data)
    }

    export async function heartbeat(api: AxiosInstance, runRid: SyncRunD.Rid): Promise<void> {
        await api.post(`/api/internal/sync-runs/${runRid}/heartbeat`)
    }

    export async function completeRun(api: AxiosInstance, runRid: SyncRunD.Rid, req: CompleteRun.Request): Promise<CompleteRun.Response> {
        const { data } = await api.post(`/api/internal/sync-runs/${runRid}/complete`, req)
        return CompleteRun.Response.parse(data)
    }

    export async function failRun(api: AxiosInstance, runRid: SyncRunD.Rid, req: FailRun.Request): Promise<void> {
        await api.post(`/api/internal/sync-runs/${runRid}/fail`, req)
    }

    export async function reapRuns(api: AxiosInstance, req: ReapRuns.Request): Promise<ReapRuns.Response> {
        const { data } = await api.post("/api/internal/sync-runs/reap", req)
        return ReapRuns.Response.parse(data)
    }

    export async function scheduledSyncs(api: AxiosInstance): Promise<ScheduledSyncs.Response> {
        const { data } = await api.get("/api/internal/syncs/scheduled")
        return ScheduledSyncs.Response.parse(data)
    }
}
