# Ontology indexer, and Forge outputs as resources

_Draft, 2026-11-12. Not built. The type layer it indexes: [ontology.md](ontology.md). Builds: [forge.md](forge.md), runtimes: [forge-runtimes.md](forge-runtimes.md). Foundry background: [research notes](../research/palantir-foundry-ontology.md) §1–2._

An object type's objects are its backing dataset's rows, indexed so apps can read, filter and follow links. In Foundry that's Object Storage V2: Funnel indexes datasets into object databases, and the Object Set Service queries them. Here, **indexing is a Forge job**, and **a side effect of commits**, as Funnel's is in Foundry. An object type is a recipe output like a dataset, downstream of its backing dataset through recipes and lineage. But only the indexer starts its builds, whenever its backing dataset commits on main (§5). Schedules and user builds target datasets only. Forge still runs the job, scoped credentials and retries included. Staleness still knows when an index is behind, and an object type's index status is its staleness.

Forge only knows dataset outputs today, so this comes in two steps:

1. **Forge outputs become resources** (§1–2). A refactor with no change in behaviour: datasets stay the only kind.
2. **The indexer** (§3–9): the object type output kind, the index database, the triggers, and the `ontology-index` runtime.

Not in scope: querying objects (object sets), permissions on objects, edits, and the graph index. §10 lists them.

## 1. Forge outputs: what's dataset-only today

Inputs stay datasets: an index reads a backing dataset or a join dataset. Only outputs generalise.

| Place | Today | After |
|---|---|---|
| `Forge.Recipe` | `outputTransactions: Record<Dataset.Rid, OutputTransaction>` | `outputs: Record<Resource.Rid, Recipe.Output>` |
| `Forge.Job` | `outputTransactions: Record<Dataset.Rid, Transaction.Rid>`, opened when the build is created | `outputs: Record<Resource.Rid, Job.Output>` |
| `forge.recipe_output_dataset` | `dataset_rid`, with a `CHECK` that it's a dataset RID; `transaction` jsonb | `forge.recipe_output`: `resource_rid`, `output` jsonb |
| `forge.current_recipe` | Keyed by `dataset_rid` | Keyed by `resource_rid` |
| `forge.job.output_transactions` | `{ <dataset rid>: <transaction rid> }` | `outputs`: `{ <resource rid>: Job.Output }` |
| `Recipe.getComputation(recipe, datasetRid)` | Returns `outputTransaction` | Takes a resource RID, returns `output` |
| `Recipe.getOutputs`, `Recipe.getDatasets` | Typed as datasets | Typed as resources. `producerOf` is keyed by resource. |
| `Forge.Build.Plan`, roots, connecting recipes | Typed as datasets, logic already generic | Types only |
| Opening, committing and aborting outputs | `CatalogClient.openTransactions`, `commitTransactions`, `abortTransactions` | Through the output's owner (§2) |
| Staleness | `catalog.getLatestTransactions`, the writer from `provenance.jobRid` | The owner's latest version per output, with its job |
| Runtime endpoints | `jobs/:rid/outputs/:datasetRid/signed-url` and `/files` | Unchanged: they're the dataset kind's. Other kinds add their own (§7). |
| `library.lineage_edge` | Any resource | Nothing |

```ts
export namespace Recipe {
    export const Output = z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("dataset"), transaction: OutputTransaction }),
        // later: { kind: "object-type" }, { kind: "link-type" }
    ])
}

export namespace Job {
    export const Output = z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("dataset"), transactionRid: Transaction.Rid }),
        // later: { kind: "object-type", version }, { kind: "link-type", version }
    ])
}
```

The `kind` sits on the output, not inferred from the RID's type segment, so code reading a recipe never parses RIDs.

## 2. Output owners

Forge decides when outputs open, commit and abort; the service that owns the resource does it. Today that's Catalog, through `CatalogClient`. After the refactor, Forge reaches each output's owner by its `kind`:

| Operation | When | Dataset (Catalog) | Object type (§6) |
|---|---|---|---|
| **Open** | Build creation | Open a transaction | Create the next version's table |
| **Commit** | The job succeeded | Commit the transaction, with incremental states | Build indexes, move the pointer, drop the old table |
| **Abort** | Failed, canceled, or the build couldn't start | Abort the transaction | Drop the new table |
| **Latest** | Staleness | Latest committed transaction, and its job | The pointer's version, and its job |

Each operation takes a batch across outputs, like today's Catalog calls. Forge groups a build's outputs by kind and calls each owner once.

A job has one outcome, but its outputs can span owners. A job writing a dataset and an object type commits to Catalog and then to the indexer. The second commit can fail after the first succeeded. Recipes with mixed kinds aren't needed yet, so publishing refuses them for now.

The refactor is done when every Forge, Catalog, Data Connection and Code Workspaces test passes with only the dataset kind, and nothing else changes.

## 3. The index database

Indexes live in their own Postgres database, reached through `INDEX_DATABASE_URL`, not in the main one:

- **The workload is different.** Bulk loads and large tables don't compete with the main database's small transactional writes, and the two can be tuned separately.
- **Everything in it can be rebuilt** from datasets, so it needs no backups. It can move to its own server later.
- **Permissions stay in the main database.** Object types are resources there, under Gatekeeper. The index database has no row-level security: the service checks access before it queries (§10).

In development it's a second database, `quarry_index`, in the same Postgres container, created by `docker/postgres/init/01-create-databases.sh`.

### Tables

Schema `objects`:

| Table | |
| --- | --- |
| `objects.index` | The pointer, one row per indexed resource: `resource_rid`, `kind` (`object-type`, `link-type`), `version`, `table_name`, `inputs` (`{ <dataset rid>: <sequence> }`), `job_rid`, `committed_at`. |
| `objects.index_build` | A version being built: `resource_rid`, `version`, `table_name`, `job_rid`, `opened_at`. At most one per resource. |
| `objects.ot_<uuid>_v<n>` | An object type's objects at version `n`. `<uuid>` is the object type RID's locator without dashes, which fits Postgres's 63-byte limit. |
| `objects.lt_<uuid>_v<n>` | A join-dataset link type's pairs at version `n`. |

- **Table names come from the RID, not the API name.** RIDs never change and are unique across ontologies. Nothing derives a table name: readers look it up in `objects.index`.
- **Columns are property API names,** quoted because they're camelCase. Renaming a property changes the definition, which rebuilds the table anyway (§4).
- **The primary key is declared on the table.** A duplicate or null key fails the load.
- **There are no foreign keys between tables.** A key pointing at an object that doesn't exist just doesn't resolve, as in Foundry.

The pointer lives in the index database, beside the tables, so moving it and dropping the old table is one local transaction.

## 4. Recipes for indexes

The Ontology service gets a publisher (`services/publisher/publisher.service.ts`, as in [publisher services](forge.md)). Saving a type publishes its recipe:

| Type | Inputs | Output | Runtime config |
| --- | --- | --- | --- |
| Object type | Its backing dataset | The object type, `{ kind: "object-type" }` | `{ type: "ontology-index", objectTypeRid, primaryKey, properties: { <api name>: { type, column } } }` |
| Link type backed by a join dataset | The join dataset | The link type, `{ kind: "link-type" }` | `{ type: "ontology-index", linkTypeRid, columns: { a, b }, keyTypes: { a, b } }` |

Foreign-key and object-backed link types have no data of their own, so no recipe (§8).

**The runtime config holds only what affects the data.** Staleness compares `Recipe.getComputation` across recipes, so a new recipe whose config differs is `logic-changed`. Display names, descriptions, the icon and the title property aren't in it, so changing them publishes a recipe that isn't stale. Mapping, types, the primary key and the backing dataset are in it, so changing them is.

Publishing records the recipe and the lineage edges ([ontology.md](ontology.md) §7) in the same call. The object type's index status, as a UI would show it, is its staleness:

| Staleness | Status |
| --- | --- |
| `never-built`, no job running | Not indexed |
| `never-built`, a job running | Initial indexing |
| Stale, a job running | Reindexing (the previous version stays readable) |
| Fresh | Up to date |
| The last job failed | Failed |

## 5. Indexing triggers

Indexing is never part of a build a user starts. Two things start an index build, always a one-job build of one type's index recipe on main, not forced:

| Trigger | Starts |
| --- | --- |
| The durable event `catalog:dataset:updated` on main, for a dataset that backs an object type or a join-dataset link type | A build of each type that dataset backs |
| Saving a type whose new recipe is `logic-changed` (§4) | A build of that type |

The listener belongs to the indexer and reacts to every commit, however it was made: a build, an upload, a sync. So a backing dataset and its objects differ only while indexing runs or after it failed, as in Foundry. Staleness shows both.

**Users can't target object types or link types.** Forge refuses them as build targets and schedule targets. Every user build and schedule targets datasets, and indexing follows from their commits. This rules out double indexing: if a schedule on an object type built its backing dataset and then indexed it, the dataset's commit event would start a second index build.

The upstream and connecting targets never reach a type anyway: types are never the input of a dataset recipe, so walking upstream from a dataset can't find one.

**A failed index doesn't fail a dataset build.** They're separate builds: the pipeline stays green, and the type shows failed.

**Commits in quick succession,** like an append loop or a series of uploads, start several index builds. Each indexes the latest version, and one that finds the type fresh is a no-op because builds aren't forced. Builds that overlap still both run until Forge locks outputs across builds. That's wasted work, not wrong results.

## 6. An object type's index, end to end

1. **Open**, when the build is created: the indexer creates `objects.ot_<uuid>_v<n+1>` with the recipe's columns and primary key, and records it in `objects.index_build`. `Job.Output` is `{ kind: "object-type", version: n + 1 }`.
2. **Run:** the ForgeAgent starts the `ontology-index` runtime. It reads the backing dataset through the existing signed input URLs and asks for a connection to its output (§7). Then DuckDB does the load in one statement: `ATTACH` the index database, then `INSERT INTO <table> SELECT <column>::<type> AS "<property>", … FROM read_parquet(…)` or `read_csv(…)` with the dataset's reader options.
3. **Commit**, when the job succeeded: the indexer creates the secondary indexes (§8) and runs `ANALYZE`. Then, in one transaction, it moves `objects.index` to the new version and drops the old table. A query that started before the swap finishes first, because `DROP TABLE` waits for it. Then it drops the job's role.
4. **Abort**, when the job failed or was canceled: drop the new table and the role. The previous version stays live.

Only two tables ever exist for an object type: the live one and the one being built. "Version" is a counter, not history.

## 7. The runtime's connection

Runtimes have no database access, so the connection is scoped like a signed URL. A new runtime endpoint, `POST jobs/:rid/outputs/:resourceRid/connection`, authenticated with the job token:

- creates a Postgres role for the job, `LOGIN` with a random password, `VALID UNTIL` a few hours ahead;
- grants it `USAGE` on `objects` and `INSERT` on the one table being built, nothing else;
- returns a connection string.

The role is dropped on commit or abort. The runtime is Quarry's code, not user code, so this isn't the transform token gap in [lineage.md](lineage.md) §6. The scope and the expiry still limit what a leaked string can do.

The agents need network access to the index database: free locally, one firewall rule in production.

The runtime follows forge-runtimes.md: `applications/ontology/runtime`, image `quarry/ontology-index-runtime`, answering `run` over stdio. Its work is DuckDB, so it can be a Node runtime with DuckDB's Node bindings. No Python is needed.

## 8. Link types in the tabular index

| Kind | Data | Adding | Removing |
| --- | --- | --- | --- |
| Foreign key | None: following it is `WHERE "<foreignKey>" = <primary key>` on the other type's table | `CREATE INDEX CONCURRENTLY` on the foreign-key column of the live table | Drop that index |
| Object-backed | None: the intermediary type's table has both key properties | Index both key columns | Drop them |
| Join dataset | Its own table, `objects.lt_<uuid>_v<n>`, indexed on both columns | A recipe and a build (§4) | Drop the table and its pointer row |

When an object type's index is rebuilt, the commit asks Ontology which link types use its properties as keys, and creates those indexes on the new table before the swap. A link type's save never rebuilds an object type.

## 9. Where it lives

The index belongs to the Ontology service at first: `applications/ontology/microservice` with a second connection, to the index database, and an indexer module that implements §2's owner operations. Foundry splits this into the Ontology Metadata Service and Object Storage. The indexer can move to its own service once queries arrive, because it owns a separate database and talks to the rest only through calls.

## 10. Later

- **Querying:** object sets with filter, sort, aggregate and search-around, read through `objects.index`. Full-text search via `tsvector` or trigram indexes, chosen per property.
- **Permissions on objects:** read on the object type, the backing dataset, or both. The query layer applies it before touching the index database, and later turns row and property policies into `WHERE` clauses.
- **Edits:** stored separately and merged by primary key when indexing.
- **Incremental indexing:** an append to the backing dataset upserts into the live table instead of building a new version.
- **A graph index**, for multi-hop traversal with large fan-out. The graph is derived: nodes are objects (type, primary key, title), edges are link instances, and traversals return primary keys that are then read from the tabular index. In the graph, every link type has data, so every link type becomes an index output. Apache AGE fits better than Neo4j: a graph per version in its own Postgres schema swaps like the tables do, with no new infrastructure. One index job writes all of an object type's indexes, and its version commits when they all have.

## 11. Open questions

- **Mixed-kind recipes:** refused for now (§2). Needed only if a transform ever writes an object type directly.
- **Where the indexer lives:** in the Ontology service (this draft), or its own service from the start.
- **How long the job's role lives,** and whether a retry gets a new one.
- **CSV casts:** a CSV backing dataset is read with its schema, so a column can fail to cast mid-load. The job fails with the row, like a duplicate key.
