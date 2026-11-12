import { z } from "zod"
import { Dataset } from "../Dataset/Dataset"
import { Foundations } from "../Foundations"
import { MicroserviceCall } from "../Foundations/MicroserviceCall"
import { ColumnSchema } from "./ColumnSchema"
import { SignedUrl } from "./SignedUrl"
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

    /** A dataset by RID or library path. */
    export namespace GetByReference {
        export const PATTERN = "catalog.get-by-reference"

        export const Request = z.object({ reference: z.string().min(1) })
        export type  Request = z.infer<typeof Request>

        export const Response = Dataset.Schema
        export type  Response = z.infer<typeof Response>
    }

    /** A dataset by RID or library path — or, for a path nothing is at yet, a new empty one there. */
    export namespace GetOrCreateByReference {
        export const PATTERN = "catalog.get-or-create-by-reference"

        export const Request = z.object({ reference: z.string().min(1) })
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

    /** Each dataset has data (a committed version): 409 naming the first that hasn't, 404 for one the caller can't see. */
    export namespace AssertNotEmpty {
        export const PATTERN = "catalog.assert-not-empty"

        export const Request = z.object({ datasetRids: Dataset.Rid.array() })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({})
        export type  Response = z.infer<typeof Response>
    }

    /** A transaction on each dataset, all opened in one database transaction or none — a build's outputs. */
    export namespace OpenTransactions {
        export const PATTERN = "catalog.open-transactions"

        export const Request = z.object({
            openings: z.record(Dataset.Rid, Transaction.Opening.Schema),
            branch:   Foundations.Branch,
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.record(Dataset.Rid, Transaction.Schema)
        export type  Response = z.infer<typeof Response>
    }

    /** Commits these open transactions — one per dataset — in one database transaction, each with the schema staged on it. */
    export namespace CommitTransactions {
        export const PATTERN = "catalog.commit-transactions"

        export const Request = z.object({
            transactions:      z.record(Dataset.Rid, Transaction.Rid),
            incrementalStates: Transaction.Incremental.States,        // how far each incremental one got, committed with it
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({})
        export type  Response = z.infer<typeof Response>
    }

    /** How far each dataset's incremental writer got: its newest committed mark, since the dataset's newest snapshot. Null if there's none. */
    export namespace GetIncrementalStates {
        export const PATTERN = "catalog.get-incremental-states"

        export const Request = z.object({ datasetRids: Dataset.Rid.array() })
        export type  Request = z.infer<typeof Request>

        export const Response = Transaction.Incremental.States
        export type  Response = z.infer<typeof Response>
    }

    /** Each dataset's newest committed transaction on main — its current version, and what wrote it (`provenance`). Null if it has none. */
    export namespace GetLatestTransactions {
        export const PATTERN = "catalog.get-latest-transactions"

        export const Request = z.object({ datasetRids: Dataset.Rid.array() })
        export type  Request = z.infer<typeof Request>

        export const Response = z.record(Dataset.Rid, Transaction.Schema.nullable())
        export type  Response = z.infer<typeof Response>
    }

    /** Aborts the open ones among these — one per dataset; finished ones are skipped, so it's safe to repeat. */
    export namespace AbortTransactions {
        export const PATTERN = "catalog.abort-transactions"

        export const Request = z.object({ transactions: z.record(Dataset.Rid, Transaction.Rid) })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({})
        export type  Response = z.infer<typeof Response>
    }

    /** One version's files as signed read URLs, for a job's runtime. */
    export namespace GetSignedReadUrls {
        export const PATTERN = "catalog.get-signed-read-urls"

        export const Request = z.object({ datasetRid: Dataset.Rid, sequence: Dataset.Sequence })
        export type  Request = z.infer<typeof Request>

        export const Response = SignedUrl.Read.Schema
        export type  Response = z.infer<typeof Response>
    }

    /** A URL that PUTs one file into an open transaction. */
    export namespace GetSignedWriteUrl {
        export const PATTERN = "catalog.get-signed-write-url"

        export const Request = z.object({ datasetRid: Dataset.Rid, transactionRid: Transaction.Rid, filename: z.string().min(1) })
        export type  Request = z.infer<typeof Request>

        export const Response = SignedUrl.Write.Schema
        export type  Response = z.infer<typeof Response>
    }

    /** A file uploaded to a signed write URL, registered on its open transaction (its Parquet footer read). */
    export namespace RegisterFile {
        export const PATTERN = "catalog.register-file"

        export const Request = z.object({
            datasetRid:     Dataset.Rid,
            transactionRid: Transaction.Rid,
            filename:       z.string().min(1),
            bytes:          z.number().int().nonnegative(),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({})
        export type  Response = z.infer<typeof Response>
    }

    export const Calls = {
        createDataset:     CreateDataset,
        get:               Get,
        getByReference:         GetByReference,
        getOrCreateByReference: GetOrCreateByReference,
        openTransaction:   OpenTransaction,
        registerChanges:   RegisterChanges,
        commitTransaction: CommitTransaction,
        abortTransaction:  AbortTransaction,
        assertNotEmpty:     AssertNotEmpty,
        openTransactions:   OpenTransactions,
        commitTransactions: CommitTransactions,
        abortTransactions:  AbortTransactions,
        getIncrementalStates: GetIncrementalStates,
        getLatestTransactions: GetLatestTransactions,
        getSignedReadUrls:  GetSignedReadUrls,
        getSignedWriteUrl:  GetSignedWriteUrl,
        registerFile:       RegisterFile,
    } satisfies MicroserviceCall.Calls
}
