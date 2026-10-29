# Catalog — Datasets

_Draft, 2026-10-18 (split from the 2026-10-13 datasets sketch). Tables and commit SQL are in [database.md](database.md#6-catalog); queues in [jobs.md](jobs.md); permissions in [gatekeeper.md](gatekeeper.md). Foundry background: [research notes](../research/palantir-foundry-ontology.md) §2–3. What writes into datasets today: [data-connection.md](data-connection.md)._

Catalog owns **datasets**: versioned tables made of immutable files. It's Foundry's dataset layer — files in object storage, a transaction history in Postgres, and a "view" computed from that history. Everything later (transforms, ontology, indexing) reads datasets; only Catalog decides what a dataset contains.

```mermaid
flowchart LR
    writer["Writer<br/>sync today; transforms later"] -- "open · register · commit" --> catalog[Catalog]
    writer -- uploads Parquet --> s3[("S3<br/>Parquet files")]
    catalog --> pg[("Postgres<br/>transactions, file lists")]
    catalog -- dataset.updated --> later["Later: builds, reindexing"]
```

---

## 1. Model

A **dataset** is a logical, versioned table: a set of immutable files plus a schema plus a transaction history. Not a file — a *history of file sets*.

| Part | What it is | Where it lives |
|---|---|---|
| **Dataset** | The resource: name, folder, grants, trash | `library.resource` + `catalog.dataset` (shared RID) |
| **Branch** | A line of history; `main` only for now | `catalog.branch` (`last_sequence`) |
| **Transaction** | One change to the file set; has a RID, isn't a resource | `catalog.transaction` |
| **Files** | `Storage.File`s — Parquet (syncs, uploads) and CSV (uploads, stored as uploaded) | Object storage; a transaction's changes list them (`catalog.transaction_change`) |
| **Schema** | Ordered column list plus a **reader** (how to parse the files), attached to a transaction | `catalog.transaction.schema` |
| **View** | The file set at one sequence, computed from transactions | Derived, never stored |

A dataset is a library resource (`ri.catalog.main.dataset.…`): it lives in a folder, inherits grants, can be trashed. A transaction (`ri.catalog.main.transaction.…`) is only addressable — access to it is access to its dataset.

### Transactions

Every write is a transaction: `open → committed | aborted`. Only committed transactions are visible.

| Type | Effect | Used by |
|---|---|---|
| `snapshot` | Replaces the whole file set | Snapshot syncs, full rebuilds |
| `append` | Adds files; can't touch existing ones | Incremental syncs |
| `update` | Adds files, may replace files at the same logical path | Corrections (breaks append-only — avoid) |
| `delete` | Removes files from the view | Cleanup |

On commit a transaction gets the next **sequence** on its branch (1, 2, 3…). Sequences are the version numbers readers ask for.

### Rules

- **Files are immutable.** An object is never overwritten. Keys are unique per transaction (`{datasetRid}/{transactionRid}/…`); the catalog maps logical paths → keys.
- **One open transaction per dataset branch** (unique index `transaction_one_open`). A second writer fails with 409.
- **An upload without a commit is invisible.** Commit is a single Postgres transaction; that's the atomicity point. S3 is just bytes.
- **Schema describes, checks enforce.** The schema is metadata written by the writer. Validation (types, key uniqueness) is a separate, optional step that can fail a transaction before commit — not built yet.
- **Only Catalog writes Catalog's tables.** Other services go through `catalog.transaction`.
- **Writers only add files.** Nothing in the write protocol deletes bytes: a `remove` drops a logical path from the view, and only background GC deletes objects ([§6](#6-events-and-housekeeping), [§7](#7-not-built-yet)). There is deliberately no "purge files" call — a writer deleting bytes could break old views and other branches.

### Schema type system

Small, explicit, independent of any source's native types (`Catalog.ColumnSchema`):

`string · integer (i32) · long (i64) · double · decimal(p,s) · boolean · date · timestamp (UTC) · binary` — nested `array / struct / map` deferred.

A schema is `{ columns, reader }`. The reader is `{ format: 'parquet' }` (the files describe themselves) or `{ format: 'csv', delimiter, quote, escape, header }` — Foundry's model, where a CSV stays a CSV and the schema says how to read it. Every file in a view has the reader's format; CSV columns are cast to the schema's types when read.

Each source's columns are mapped onto these; unmappable types become `string` (with a warning), never a silent drop. Postgres mapping: [data-connection.md §3](data-connection.md#3-source-definitions-and-runtimes).

---

## 2. `CatalogService`

**One entry point.** Other services inject `CatalogService` and nothing else from Catalog; the module doesn't export anything another service could write through.

| | `catalog.*` | `catalog.transaction.*` |
|---|---|---|
| Deals with | the dataset as a resource | changing its contents |
| Methods | `createDataset`, `get`, `view` | `open`, `openBatch`, `registerChanges`, `commit`, `abort`, `abortBatch`, `storagePrefix` |
| Called by | the API (users), other services | writers — the sync runner, the sync reaper, and `catalog.storage` |
| Spans | one request | a job: open, minutes of uploading, commit |

`catalog.storage` (`CatalogStorage`, `storage/catalog-storage.service.ts`) is the writer and reader for files that come through the API: uploads, previews and schema edits. It uses `catalog.transaction` like any other writer, plus an in-process DuckDB (`files/duckdb.ts`) for what it must know about a file's contents.

`catalog.transaction` is a `DatasetTransactions` instance (`transaction/dataset-transactions.ts`) — a class only so its methods can carry `@SecurityGate`; it's provided inside Catalog and not exported. Both halves use `DatasetRepository` / `TransactionRepository`. Creating a dataset is `DatasetRepository.create` under `@EnsureResource('dataset')` — the library row, the dataset row and branch `main` in one transaction.

### HTTP API (`Catalog.API`)

| Route | Service | Gate |
|---|---|---|
| `POST /datasets` `{ parentRid, name, description }` | `createDataset` | `write` on the parent folder |
| `GET /datasets` | `list` — every live dataset the caller can see, across projects | `discover` (RLS) |
| `GET /datasets/:rid` | `get` | `discover` |
| `GET /datasets/:rid/view?sequence=` | `view` | `read` |
| `POST /datasets/upload` (multipart: `parentRid`, `name?`, `description?`, `file`) | `files.createFromFile` | `write` on the parent folder |
| `POST /datasets/:rid/upload` (multipart: `mode` = `snapshot` \| `append`, `file`) | `files.upload` | `write` on the dataset |
| `GET /datasets/:rid/preview?limit=` (1–1000, default 100) | `files.preview` | `read` |
| `PUT /datasets/:rid/schema` `{ schema }` | `files.setSchema` | `write` on the dataset |

There's no HTTP route for transactions themselves: the upload routes open and commit one on the caller's behalf.

### Uploads

A `.csv` or `.parquet` file, **stored as uploaded** (Foundry's model — a CSV isn't converted):

1. Open a transaction (`snapshot` or `append`) — the write check happens here, before anything else.
2. Stream the request body to S3 under the transaction's prefix (`FileStorage.upload`, multipart, never buffered). No size cap unless `QUARRY_UPLOAD_MAX_BYTES` is set (413).
3. Infer the schema with DuckDB: `sniff_csv` for a CSV's dialect and columns; the footer for Parquet's columns and row count. Zero-byte files are rejected.
4. Register the file and commit. A snapshot (or the first file) brings its inferred schema; an append keeps the dataset's and must match it — same format, same column names in order, same CSV delimiter and header — else 400. A logical path already in the view is 409.

Any failure aborts the transaction (storage GC removes the bytes); a failed `createFromFile` also trashes the dataset it just created. Fields must come before the file in the multipart body.

**Preview** reads the latest view's first rows with its schema (`read_parquet` / `read_csv` with the reader's options and the schema's types). **Schema edits** commit an `update` transaction with no file changes, after checking that the files read with the new schema and that the reader's format matches the files.

---

## 3. The write protocol

```mermaid
sequenceDiagram
    participant W as Writer
    participant T as catalog.transaction
    participant S3

    W->>T: open(datasetRid, type, provenance)
    T-->>W: transaction (rid) — gate: write on the dataset
    W->>T: storagePrefix(datasetRid, transactionRid)
    T-->>W: "{datasetRid}/{transactionRid}/"
    W->>S3: upload Parquet under the prefix
    Note over W,S3: Catalog never sees the bytes
    W->>T: registerChanges(datasetRid, transactionRid, changes)
    alt success
        W->>T: commit(datasetRid, transactionRid, schema)
        T-->>W: sequence
    else failure
        W->>T: abort(datasetRid, transactionRid)
        Note over T,S3: storage GC deletes the files later
    end
```

- **`open`** inserts the transaction (`started_by` from the principal). `provenance` is free-form JSON recording who wrote it — a sync run writes `{ syncRid, syncRunRid }`.
- **`openBatch`** opens one transaction on each of several datasets in one database transaction — all or none; a dataset already being written is a 409 naming it. Datasets are inside the payload, so it checks their liveness itself. A build opens its outputs with it ([forge.md](forge.md)).
- **`abortBatch`** aborts the open ones among several transactions (each addressed through its dataset) in one database transaction; finished ones are skipped, so it's safe to repeat. Builds abort their outputs with it.
- **`registerChanges`** records the transaction's changes: `add` a stored file at a logical path, or `remove` a logical path. Called once or many times.
- **`commit`**, in one Postgres transaction: lock the branch row (serialises commits), take `last_sequence + 1`, mark the transaction committed with its schema. Returns the sequence.
- **`abort`** marks the transaction aborted. A no-op if it's already finished — failure paths race (runner catch block, sync reaper).

### Permissions and liveness

**A transaction is always addressed through its dataset** — every method takes `(datasetRid, transactionRid)`, like Foundry's `/datasets/{datasetRid}/transactions/{transactionRid}/commit`. That puts a resource RID in the signature, so the standard decorators do all the checking:

| Step | Permission | Liveness |
|---|---|---|
| `open`, `registerChanges`, `commit` | `@SecurityGate('write')` on the dataset | automatic — `@Transactional` checks the dataset (a top-level argument); 404 if it or a folder above it is trashed |
| `abort` | `@SecurityGate('write')` on the dataset | **skipped**: the repository marks the dataset `@AllowTrashed()` — aborting is how a writer cleans up after a trash |

The repository matches on **both** RIDs (`WHERE rid = $transaction AND dataset_rid = $dataset`), so write on dataset A can't be used to commit or abort a transaction of dataset B — that's a 404 (or a no-op abort). Service principals skip the permission check, as everywhere, but not liveness.

Writers act as the principal they were given: a sync run as a **delegate** of the user it runs for, so if that user loses write on the dataset, their runs stop at `open`. Cleanup (`abort`) runs as `SELF` so it succeeds regardless.

**Accepted race:** a trash landing between `@Transactional`'s liveness check and the commit lets that one commit through. Its data is still unreachable — every read path checks liveness. Closing it would mean locking every ancestor on each commit.

---

## 4. Reading: view resolution

`TransactionRepository.resolveView(datasetRid, branch, sequence?)` — the file set at `sequence` (default: the branch's `last_sequence`):

1. `sequence = 0` → empty view (nothing committed yet).
2. Find the latest committed `snapshot` at or before it (none → start at 1).
3. Apply every committed transaction from there up to `sequence`, in order, by logical path: `add` sets, `remove` deletes.
4. Schema = the latest non-null schema at or before `sequence`. Row count = sum of file row counts, if all are known.

Reading an old sequence is the same algorithm stopped earlier — time travel for free, until retention removes the files.

The result (`Catalog.Dataset.View.Schema`) lists **files** — their keys, not their data. Readers (the preview endpoint, transforms later) fetch the files themselves.

---

## 5. Storage

### Files: three concepts

| Concept | Where | What it is |
|---|---|---|
| **`Storage.File`** | shared `Storage` | An object in storage: `key`, `bytes`, `format`, plus that format's metadata (`Storage.File.Parquet.Schema` adds `rowCount`). Knows nothing about datasets. `Storage.File.Schema` is the union, discriminated by `format`. |
| **`Catalog.Transaction.FileChange`** | a transaction | An instruction, not a file: `add` a `Storage.File` at a logical path, or `remove` a logical path. Stored in `catalog.transaction_change`. |
| **`Catalog.Dataset.View.File`** | a view | A `Storage.File` plus its **logical path** — its name within this dataset, unique within one view (two datasets can both have `part-0.parquet`). |

The **key** is where the bytes are, written once and never reused. The **logical path** is the dataset's name for the file, stable across versions — an `update` can put new bytes (a new key) at the same logical path.

S3-compatible object storage, through `FileStorage` (`infra/file-storage.ts`) — code against the S3 API only, so the backend is swappable:

| Environment | Backend |
|---|---|
| Local dev | SeaweedFS's S3 gateway (docker compose, host port 9000) |
| Cloud | AWS S3 / Cloudflare R2 / GCS (S3 interop) / Azure Blob |

```
s3://{S3_BUCKET}/
  {datasetRid}/
    {transactionRid}/             catalog.transaction.storagePrefix
      data_0.parquet              written by the writer (sync: DuckDB COPY … PER_THREAD_OUTPUT)
      data_1.parquet
      sales.csv                   or an uploaded file, under its own name
```

Nothing readable depends on listing the bucket — the catalog's file list is the truth. Target ~128 MB per Parquet part, Snappy or Zstd.

**Build vs adopt.** Delta Lake / Iceberg solve the same problem (Parquet + a transaction log). We own a thin catalog for v1: Foundry's transaction types and branch semantics map directly onto a few Postgres tables, and we avoid a JVM/Spark-centric stack. The layout stays Iceberg-friendly (immutable Parquet, explicit file lists), so exporting to Iceberg later stays possible.

---

## 6. Housekeeping

Scheduled by the **system worker** (`packages/system-worker`), which has no database: the Postgres part of each job is a server endpoint (`Catalog.API.Internal`: `POST /internal/storage-gc`). Queue definitions in `Catalog.Queue` ([jobs.md](jobs.md)).

| Job | Cadence | Does |
|---|---|---|
| `catalog.storage-gc` | hourly (singleton) | Aborts transactions open > 24 h; deletes the storage prefix of every transaction aborted in the last 7 days (idempotent) |

No events on commit. A `dataset.updated` event (a `catalog.outbox` table, a relay in the system worker, a `catalog.dataset-updated` queue) was removed on 2026-10-29: nothing consumed it, and a work queue is the wrong shape for an event that several unrelated parties react to.

---

## 7. Not built yet

- **History retention** — deleting old versions of a live dataset. Planned as **one global policy**, not a per-dataset setting: keep the latest view plus N days of history, computed from `finished_at` (nothing counts down). Files referenced only by older views are marked, then swept after a grace period (Foundry's mark-and-sweep). The latest view is never deleted; append-only datasets, whose history all stays in the latest view, need an opt-in age-based mode. Per-dataset or per-project overrides later, as a policy table, if ever needed. Until then, `delete` transactions only hide files and old views stay readable forever.
- **Trash purge** — a separate thing: permanently deleting a whole trashed resource (library row, dataset rows, every file) once `trashed_at` is older than one global setting. Starts in Library (`library.purge`, [jobs.md](jobs.md)), which asks each owning service to purge its part.
- **Orphaned files** — files uploaded under a prefix with no transaction row (writer crashed before `open` returned) aren't swept.
- **Schema checks** — no validation before commit; schema changes aren't detected or warned about.
- **Branches beyond `main`**, queries beyond the preview, unstructured datasets (the model allows files without a schema; no tooling), Excel and other upload formats, pre-signed direct uploads, a schema editor in the frontend (the API exists).
- **CSV row counts** — not counted on upload, so a CSV view's row count is unknown.
- **Reacting to dataset updates** (update-triggered builds, reindexing) — not needed yet. For builds, prefer Forge pulling: compare each input's `last_sequence` with what its last build used, woken by a `NOTIFY` on commit. If several unrelated subscribers appear, a subscriber registry: the commit writes one pending row per registered subscriber in its transaction; an observer runs each subscriber's handler and deletes its rows only after it succeeds.

---

## 8. Open questions

- **Large initial loads** — one transaction with many parts, or several `append`s?
- **Retention semantics** — keep views for N days, or the last N sequences? What about a view a running build is reading?
- **`update` transactions** — keep them, or drop them as Foundry-compat baggage? Today's writers never produce one.
