import { z } from "zod"
import { Dataset } from "../Dataset/Dataset"
import { MicroserviceCall } from "../Foundations/MicroserviceCall"
import { ColumnSchema } from "./ColumnSchema"
import { Transaction } from "./Transaction"
import { API } from "./api"

/**
 * What the Catalog service serves other services (docs/design/architecture-split.md §8) — the whole
 * of it, by the method name its client gets. Called as the acting user or delegate, so Gatekeeper and
 * RLS apply as if they had called; `abortTransaction` also as the calling service, for cleanup.
 */
export namespace Microservice {

    export namespace CreateDataset {
        export const PATTERN = "catalog.create-dataset"

        export const Request = API.Dataset.Create.Request
        export type  Request = z.infer<typeof Request>

        export const Response = Dataset.Schema
        export type  Response = z.infer<typeof Response>
    }

    export namespace Get {
        export const PATTERN = "catalog.get"

        export const Request = z.object({ rid: Dataset.Rid })
        export type  Request = z.infer<typeof Request>

        export const Response = Dataset.Schema
        export type  Response = z.infer<typeof Response>
    }

    /** A transaction on the dataset's main branch; `provenance` says what opened it. */
    export namespace OpenTransaction {
        export const PATTERN = "catalog.open-transaction"

        export const Request = z.object({
            datasetRid: Dataset.Rid,
            type:       Transaction.Type,
            provenance: z.record(z.string(), z.unknown()),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = Transaction.Schema
        export type  Response = z.infer<typeof Response>
    }

    export namespace RegisterChanges {
        export const PATTERN = "catalog.register-changes"

        export const Request = z.object({
            datasetRid:     Dataset.Rid,
            transactionRid: Transaction.Rid,
            changes:        Transaction.FileChange.Schema.array(),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({})
        export type  Response = z.infer<typeof Response>
    }

    /** The transaction's files become the dataset's new version, read with `schema` (null: inferred). */
    export namespace CommitTransaction {
        export const PATTERN = "catalog.commit-transaction"

        export const Request = z.object({
            datasetRid:     Dataset.Rid,
            transactionRid: Transaction.Rid,
            schema:         ColumnSchema.Schema.nullable(),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ sequence: Dataset.Sequence })
        export type  Response = z.infer<typeof Response>
    }

    export namespace AbortTransaction {
        export const PATTERN = "catalog.abort-transaction"

        export const Request = z.object({ datasetRid: Dataset.Rid, transactionRid: Transaction.Rid })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({})
        export type  Response = z.infer<typeof Response>
    }

    export const Calls = {
        createDataset:     CreateDataset,
        get:               Get,
        openTransaction:   OpenTransaction,
        registerChanges:   RegisterChanges,
        commitTransaction: CommitTransaction,
        abortTransaction:  AbortTransaction,
    } satisfies MicroserviceCall.Calls
}
