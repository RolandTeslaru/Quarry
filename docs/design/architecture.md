# Quarry — Architecture & File Structure

_Draft, 2026-10-13. Scope: layer 1 — Identity, Library, Gatekeeper, Catalog (datasets), Data Connection (sources → syncs). Ontology, transforms and builds come later and aren't laid out here._

Related: [database.md](database.md) (all DDL) · [jobs.md](jobs.md) (queues) · [gatekeeper.md](gatekeeper.md) (authorization) · [catalog.md](catalog.md) (datasets) · [data-connection.md](data-connection.md) (sources, syncs) · [research notes](../research/palantir-foundry-ontology.md).

---

## 1. Shape

**A modular monolith with three entry points.** One codebase, one image; each container starts a different entry point that loads only the modules it needs. Modules are separated by Postgres schema, typed database access and import rules — not by the network.

```mermaid
flowchart LR
    browser([Browser])

    subgraph image["One image: @quarry/server"]
        api["<b>api</b><br/>controllers → services → repositories"]
        sync["<b>sync-worker</b><br/>sync processors → SyncRunner → Catalog"]
        system["<b>system-worker</b><br/>outbox, scheduler, GC, reaper"]
    end

    pg[("Postgres<br/>one DB, schema per service")]
    redis[("Redis<br/>BullMQ")]
    s3[("MinIO / S3<br/>Parquet files")]
    gotrue["GoTrue<br/>auth, own database"]
    sources[("Source systems<br/>customer DBs, SAP, …")]

    browser --> api
    browser -. login .-> gotrue
    image --> pg
    image --> redis
    image --> s3
    sync -- only process with access --> sources
```

| Container | Command | Purpose |
|---|---|---|
| `api` | `node dist/api.js` | HTTP API; never runs long work, never talks to source systems |
| `sync-worker` | `node dist/workers/sync.js` | Data Connection: sync runs, connection tests, table exploration |
| `system-worker` | `node dist/workers/system.js` | Light housekeeping: outbox relay, sync scheduler, storage GC, reaper |
| `postgres` | — | All service schemas + GoTrue's `auth` |
| `redis` | — | BullMQ only; disposable (rebuilt from Postgres on boot) |
| `gotrue` | — | Authentication, JWTs |
| `minio` | — | S3-compatible object storage for dataset files |

### Why the sync worker is its own process

- **Resources** — DuckDB `COPY` runs can take lots of memory and CPU; a large sync can't starve the API or housekeeping. It gets its own memory limit and concurrency.
- **Network** — it's the **only** container that needs a route to source systems. In a locked-down deployment, only it gets egress to customer databases.
- **Secrets** — it's the **only** container that resolves source credentials (`secret_ref`). The API never sees them.
- **Failure** — a crashing driver or a runaway query kills one sync worker; BullMQ re-delivers or the reaper cleans up.
- **Scaling** — idle most of the time; run one, or more when many syncs are scheduled. Later this is also the natural shape for a Data Connection **agent** running inside a customer network.

Because of the network and secret boundary, **connection tests and table exploration also run in the sync worker**: the API enqueues a short `source-probe` job and waits for its result (`job.waitUntilFinished`, a few seconds' timeout). Slightly more latency on those two calls, in exchange for the API never holding a source credential.

All three can run as several replicas. Future workers follow the same pattern — e.g. a `transform-worker` for builds — each with its own entry point and module set.

---

## 2. Repository layout

```
Quarry/
├── package.json                  npm workspaces: packages/*
├── Dockerfile                    one image for api + workers (Debian — DuckDB needs glibc)
├── docker-compose.yml            postgres · redis · gotrue · minio; api + workers under profile `app`
├── docker/postgres/init/         creates GoTrue's own database
├── .env.example
├── docs/
│   ├── design/                   architecture.md · database.md · gatekeeper.md · catalog.md · data-connection.md · jobs.md · ai-context.md
│   └── research/                 palantir-foundry-ontology.md
└── packages/
    ├── shared/                   @quarry/shared — domain types + API contracts, used by server and frontend
    ├── server/                   @quarry/server — api + workers
    └── frontend/                 later
```

### `packages/shared`

Domain models and API contracts only: zod schemas, branded IDs, RID types, request/response types, typed API client functions (axios). **No database, no NestJS, no Node-only imports** — the frontend imports it too.

Same layout as PretzelGraph's shared domain: **entity files are pure domain** (IDs, schemas, rules); **contracts live on the service namespace**: the HTTP surface in an `api/` folder (`<Service>.API`, grouped by entity — `Catalog.API.Dataset.Create.Request`, `Library.API.Resource.move(api, rid, req)`), and background-job contracts in a `queue/` folder (`<Service>.Queue` — `DataConnection.Queue.Sync.Definition`; see [jobs.md](jobs.md)). Each `<Service>.API` mirrors that service's controllers one-to-one. `Request` types are `z.input` (what a client sends, defaults optional); controllers receive the parsed `z.output`.

```
packages/shared/
└── domain/
    ├── index.ts                  re-exports every service namespace
    ├── Foundations/
    │   ├── Rid.ts                Rid<S,T> type, Rid.create / parse / generateSchema / ofTypes, uuidv7
    │   ├── Queue.ts              Queue.Name (branded), Definition, define(), Options — the queue contract
    │   └── index.ts
    ├── Identity/
    │   ├── User.ts               User.Rid (ri.identity.main.user.<GoTrue id>), fromAuthId, WorkspaceRole, Schema
    │   ├── Group.ts              Group.Rid (ri.identity.main.group.<uuidv7>), createRid, Schema, Member
    │   ├── api/index.ts          Identity.API: Me, Users, Groups
    │   └── index.ts              namespace Identity { User, Group, API }
    ├── Library/
    │   ├── Resource.ts           Resource.Type, Rid, Base (shared fields), Name
    │   ├── Project.ts            Project.Rid, Schema
    │   ├── Folder.ts             Folder.Rid, Schema
    │   ├── api/                  Library.API: project.ts · folder.ts · resource.ts (get, path, children, rename, move, trash)
    │   └── index.ts
    ├── Gatekeeper/
    │   ├── Role.ts               'discoverer' | 'viewer' | 'editor' | 'owner', RANK
    │   ├── Action.ts             'discover' | 'read' | 'write' | 'manage', MINIMUM_RANK, isAllowed
    │   ├── Grant.ts              Subject, Schema (keyed by resource + subject; no id)
    │   ├── api/                  Gatekeeper.API: grant.ts (list, put, revoke)
    │   └── index.ts
    ├── Catalog/
    │   ├── Dataset.ts            Dataset.Rid, Schema, View (the dataset at a sequence)
    │   ├── Transaction.ts        Transaction.Rid, Type, Status, Schema, File
    │   ├── ColumnSchema.ts       the dataset type system (string, long, decimal(p,s), …)
    │   ├── api/                  Catalog.API: dataset.ts (create, get, getView)
    │   ├── queue/                Catalog.Queue: OutboxRelay, StorageGc, DatasetUpdated
    │   └── index.ts
    └── DataConnection/
        ├── Source.ts             Source.Rid, Kind, Settings (per-kind config), SecretRef, Schema, Table
        ├── Sync.ts               Sync.Rid, Target, Mode, Schedule, Schema
        ├── SyncRun.ts            SyncRun.Id, Status, Trigger, Schema
        ├── api/                  DataConnection.API: source.ts (create, get, test, explore) · sync.ts (list, create, run, listRuns)
        ├── queue/                DataConnection.Queue: Sync, SourceProbe, SyncReaper
        └── index.ts
```

### `packages/server`

```
packages/server/
├── migrations/                   .sql migrations, one folder per Postgres schema (run in this order)
│   ├── foundations/              001_initial.sql — the `foundations.rid` domain, needed by every other schema
│   ├── identity/                 001_initial.sql
│   ├── library/                  001_initial.sql
│   ├── gatekeeper/               001_initial.sql
│   ├── catalog/                  001_initial.sql
│   └── data_connection/          001_initial.sql
└── src/
    ├── api.ts                    entry: NestFactory.create(ApiModule)
    ├── api.module.ts             service modules + all controllers + AuthGuard
    ├── workers/
    │   ├── bull.ts               BullModule root (lazy env) + consumes(...queues) helper
    │   ├── sync.ts               entry: createApplicationContext(SyncWorkerModule)
    │   ├── sync-worker.module.ts DataConnection + Catalog + Library; sync + source-probe processors
    │   ├── system.ts             entry: createApplicationContext(SystemWorkerModule)
    │   └── system-worker.module.ts  outbox, scheduler, storage GC, reaper processors
    ├── load-env.ts
    │
    ├── auth/                     authentication → Principal
    │   ├── principal.ts          Principal = User | Delegate | Service; Principal.SELF(reason), Principal.onBehalfOf(userRid, via)
    │   ├── auth.guard.ts         verify GoTrue JWT locally, load identity.user (global APP_GUARD)
    │   ├── current-principal.ts  @CurrentPrincipal(), @Public()
    │   └── gotrue.ts             GoTrue admin client (invites)
    │
    ├── db/                       database plumbing — no tables here
    │   ├── pool.ts               the one Kysely instance + pg pool; defineDatabase<Tables>() → asUser / asService
    │   ├── repository.ts         Repository(DB) base + @Transactional (PretzelCloud pattern)
    │   ├── table.ts              Table<RowSchema, Generated> helper; ReadOnly<Table>
    │   ├── errors.ts             catchDatabaseErrors → HTTP exceptions
    │   ├── migrator.ts           one Kysely Migrator per schema
    │   └── migrate.ts            CLI entry: run all migrations in order
    │
    ├── infra/                    clients for external systems
    │   ├── file-storage.ts       FileStorage: the bucket behind Storage.File — write-once objects by key (list, delete, deletePrefix; DuckDB settings)
    │   ├── duckdb.ts             DuckDB instance + extensions (postgres, httpfs)
    │   ├── redis.ts              ioredis connection
    │   └── queue.ts              QueueManager producer + JobProcessor base (BullMQ runtime) — see jobs.md
    │
    ├── http/                     zod.pipe.ts · health.controller.ts
    │
    └── services/                 one folder per service = one Postgres schema
        ├── Identity/
        ├── Library/
        ├── Gatekeeper/
        ├── Catalog/
        └── DataConnection/
```

Each service module (`*.module.ts`) registers **providers only** (services, repositories, adapters) and exports its public services. Controllers are listed in `api.module.ts` and processors in each worker's module, so a worker never instantiates HTTP controllers, the API never runs queue processors, and each worker runs only its own queues.

**Every process is a NestJS app.** The API uses `NestFactory.create`; the workers use `NestFactory.createApplicationContext` — full DI, modules and lifecycle hooks, no HTTP server. Processors are `@nestjs/bullmq` classes (`@Processor('sync')` extending `WorkerHost`), and `enableShutdownHooks()` lets a worker finish or release its current job on stop.

Source adapters and the `SecretResolver` are provided **only** in `sync-worker.module.ts` — the API module can't inject them, so it physically can't open a connection to a source system.

---

## 3. Services in detail

Naming follows Pretzel: `<name>.module.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `.db.ts` (database module: rows, tables, `toDomain`), `.processor.ts` (BullMQ consumer).

### Identity — schema `identity`

```
services/Identity/
├── identity.module.ts
├── identity.db.ts            IdentityDB: User.Row, Group.Row, GroupMember.Row, Tables, ReadTables
├── user.repository.ts
├── group.repository.ts
├── identity.service.ts       users (invite, deactivate, set admin), groups, membership
├── me.controller.ts          GET/PATCH /api/me
├── users.controller.ts       /api/users (admin)
└── groups.controller.ts      /api/groups
```

| Tables | `identity.user` · `identity.group` · `identity.group_member` |
|---|---|
| Foundation | Yes — every module may **read** these (via `IdentityDB.ReadTables`) |

### Library — schema `library`

```
services/Library/
├── library.module.ts
├── library.db.ts             LibraryDB: Resource.Row, ResourceAncestor.Row, Tables, ReadTables
├── resource.repository.ts    get, list children, path, move, rename, trash, restore
├── library.statements.ts     insertResource / liveResources(trx, …) — Library's SQL run inside other code's transactions
├── ensure-resource.ts          @EnsureResource('<type>') — the only cross-schema write path: a subtype's create method writes its library row first, same transaction (see §5)
├── library.service.ts        projects, folders, move, trash; @SecurityGate on each
└── library.controller.ts     /api/resources/:rid, /api/projects, /api/folders/:rid/children
```

| Tables | `library.resource_type` · `library.resource` · `library.resource_ancestor` (+ triggers) |
|---|---|
| Foundation | Yes — every module may **read** `resource` and `resource_ancestor` |

### Gatekeeper — schema `gatekeeper`

```
services/Gatekeeper/
├── gatekeeper.module.ts      global module: every service injects GatekeeperService
├── gatekeeper.db.ts          GatekeeperDB: RoleGrant.Row, Tables
├── grant.repository.ts       effective ranks (calls gatekeeper.effective_ranks), grant, revoke, list
├── gatekeeper.service.ts     class GatekeeperService: rank, can, assert, filter, grant, revoke
├── security-gate.ts          @SecurityGate(action)
├── request-memo.ts           AsyncLocalStorage memo keyed (principal, rid, action)
├── epoch.listener.ts         LISTEN gatekeeper_epoch (for the deferred decision cache)
└── grants.controller.ts      /api/resources/:rid/grants
```

| Tables | `gatekeeper.role` · `gatekeeper.role_grant` · `gatekeeper.epoch` (+ epoch triggers on foundation tables) |
|---|---|
| Foundation | No — nobody else reads grants; everyone calls `GatekeeperService` |

### Catalog — schema `catalog`

Sub-concepts get their own folder — `transaction/`, `outbox/` — so a service is namespaced the way the shared domain is.

```
services/Catalog/
├── catalog.module.ts
├── catalog.db.ts                 CatalogDB: Dataset/Branch/Transaction/TransactionFile/Outbox rows, Tables
├── catalog.service.ts            Catalog's one entry point: create, get, view; .transaction = the write protocol
├── catalog.controller.ts         /api/datasets, /:rid, /:rid/view
├── dataset.repository.ts         create (library row + dataset + branch main), get
├── storage-gc.processor.ts       system-worker: abort stale transactions, delete files of aborted ones
├── transaction/
│   ├── dataset-transactions.ts   the write protocol, reached as catalog.transaction: open → upload under storagePrefix → registerChanges → commit / abort
│   └── transaction.repository.ts open, registerChanges, commit (sequence + outbox row), abort, resolveView, housekeeping queries
└── outbox/
    ├── outbox.repository.ts      pending, markPublished
    └── outbox.processor.ts       system-worker: relay catalog.outbox → the catalog.dataset-updated queue
```

| Tables | `catalog.dataset` · `catalog.branch` · `catalog.transaction` · `catalog.transaction_change` · `catalog.outbox` |
|---|---|
| File storage | `s3://datasets/{datasetRid}/{transactionRid}/data_N.parquet` (bucket `S3_BUCKET`) |
| Queues | `Catalog.Queue`: `OutboxRelay`, `StorageGc`, `DatasetUpdated` (shared domain) |

### DataConnection — schema `data_connection`

Split in two Nest modules: what the API may load, and what only the sync worker may load (anything that touches a source system or a credential).

```
services/DataConnection/
├── data-connection.module.ts       API-safe: repositories + DataConnectionService; no adapters, no secrets
├── data-connection.db.ts           DataConnectionDB: Source/Sync/SyncRun rows, Tables
├── source.repository.ts
├── sync.repository.ts
├── sync-run.repository.ts          start (unique running), finish, latest cursor, stuck runs
├── data-connection.service.ts      sources (create, configure), syncs (create, run now, history);
│                                   test / explore → enqueue `source-probe` and await the result
├── data-connection.controller.ts   /api/sources/:rid, /test, /explore, /syncs, /syncs/:syncRid/run
│
├── runtime/                        ── sync-worker only ──
│   ├── runtime.module.ts           adapters + SecretResolver + SyncRunner + processors; imported by sync-worker.module.ts only
│   ├── secrets.ts                  SecretResolver: secret_ref → credential (env for now)
│   ├── adapters/
│   │   ├── source-adapter.ts       interface: test, explore, shape, read
│   │   ├── adapter.registry.ts     kind → adapter
│   │   └── postgres.adapter.ts     via DuckDB postgres extension
│   ├── sync.runner.ts              one run: open txn → DuckDB COPY → register → commit (catalog.transaction)
│   ├── sync.processor.ts           queue `sync` → SyncRunner
│   └── source-probe.processor.ts   queue `source-probe` → adapter.test / adapter.explore
│
└── housekeeping/                   ── system-worker ──
    ├── housekeeping.module.ts      imported by system-worker.module.ts only
    ├── sync-scheduler.ts           boot + on change: reconcile BullMQ job schedulers with sync.schedule
    └── sync-reaper.processor.ts    fail stuck runs, abort their open dataset transactions
```

| Tables | `data_connection.source` · `data_connection.sync` · `data_connection.sync_run` |
|---|---|
| Queues | `sync` (deduplicated by `sync:<syncRid>`) and `source-probe` → **sync-worker**; `sync-reaper` (repeatable) → **system-worker** |

The scheduler only *enqueues* `sync` jobs, so it stays in the system worker; the sync worker only consumes.

---

## 4. Where every table lives

| Postgres table | Owner service | DB module | Migrations |
|---|---|---|---|
| `identity.user` | Identity | `services/Identity/identity.db.ts` | `migrations/identity/` |
| `identity.group` | Identity | 〃 | 〃 |
| `identity.group_member` | Identity | 〃 | 〃 |
| `library.resource_type` | Library | `services/Library/library.db.ts` | `migrations/library/` |
| `library.resource` | Library | 〃 | 〃 |
| `library.resource_ancestor` | Library | 〃 | 〃 |
| `gatekeeper.role` | Gatekeeper | `services/Gatekeeper/gatekeeper.db.ts` | `migrations/gatekeeper/` |
| `gatekeeper.role_grant` | Gatekeeper | 〃 | 〃 |
| `gatekeeper.epoch` | Gatekeeper | 〃 | 〃 |
| `catalog.dataset` | Catalog | `services/Catalog/catalog.db.ts` | `migrations/catalog/` |
| `catalog.branch` | Catalog | 〃 | 〃 |
| `catalog.transaction` | Catalog | 〃 | 〃 |
| `catalog.transaction_change` | Catalog | 〃 | 〃 |
| `catalog.outbox` | Catalog | 〃 | 〃 |
| `data_connection.source` | DataConnection | `services/DataConnection/data-connection.db.ts` | `migrations/data_connection/` |
| `data_connection.sync` | DataConnection | 〃 | 〃 |
| `data_connection.sync_run` | DataConnection | 〃 | 〃 |
| `auth.*` | GoTrue | — not ours | GoTrue's own |

The DDL for all of them is in [database.md](database.md).

---

## 5. Domain models vs rows

Two representations, as in Pretzel, joined by `toDomain`:

| | Domain model | Row |
|---|---|---|
| Lives in | `@quarry/shared` — `Catalog.Dataset.Schema` | `@quarry/server` — `CatalogDB.Dataset.Row` in `catalog.db.ts` |
| Shape | camelCase, what the API returns and the frontend renders | snake_case, column for column |
| Used by | services, controllers, frontend | repositories only |

### Foundations

```ts
// shared/domain/Foundations/Rid.ts
export namespace Foundations {
    type Uuid = `${string}-${string}-${string}-${string}-${string}`;

    export type Rid<S extends string = string, T extends string = string> = `ri.${S}.main.${T}.${Uuid}`;

    export namespace Rid {
        export const create = <S extends string, T extends string>(service: S, type: T) =>
            `ri.${service}.main.${type}.${uuidv7()}` as Rid<S, T>;

        export const generateSchema = <S extends string, T extends string>(service: S, type: T) =>
            z.string().regex(ridPattern(service, type)).transform((v) => v as Rid<S, T>);

        export const parse = (rid: Rid) => { /* → { service, instance, type, locator } */ };
    }
}
```

### Library resource — the shared fields

```ts
// shared/domain/Library/Resource.ts
export namespace Resource {
    export const Type = z.enum(['project', 'folder', 'dataset', 'source']);
    export type  Type = z.infer<typeof Type>;

    export type  Rid = Foundations.Rid<string, Type>;

    // What every resource has, whatever its type. Subtypes extend this.
    export const Base = z.object({
        rid:         z.string(),                       // narrowed by each subtype
        type:        Type,
        name:        z.string(),
        description: z.string().nullable(),
        parentRid:   z.string().nullable(),
        createdBy:   User.Rid.nullable(),               // null = the system
        createdAt:   z.coerce.date(),
        updatedAt:   z.coerce.date(),
        trashedAt:   z.coerce.date().nullable(),
    });
}
```

### A subtype — Dataset

```ts
// shared/domain/Catalog/Dataset.ts — pure domain
export namespace Dataset {
    export type  Rid = Foundations.Rid<"catalog", "dataset">
    export const Rid = Foundations.Rid.generateSchema("catalog", "dataset")
    export const createRid = () => Foundations.Rid.create("catalog", "dataset")

    export const Schema = Resource.Base.extend({
        rid:           Rid,
        type:          z.literal("dataset"),
        parentRid:     Resource.Rid,
        lastSequence:  z.number().int(),
    })
    export type Schema = z.infer<typeof Schema>
}

// shared/domain/Catalog/api/dataset.ts — the HTTP surface, as Catalog.API.Dataset
export namespace Dataset {
    export namespace Create {
        export const Request  = z.object({ parentRid: ResourceD.Rid, name: ResourceD.Name, description: z.string().nullable().default(null) })
        export type  Request  = z.input<typeof Request>
        export const Response = z.object({ dataset: DatasetD.Schema })
        export type  Response = z.infer<typeof Response>
    }
    // Get, GetView …

    export async function create(api: AxiosInstance, req: Create.Request): Promise<Create.Response> {
        const { data } = await api.post("/api/datasets", req)
        return Create.Response.parse(data)
    }
}
```

The domain `Dataset` is the **library fields + the catalog fields**. The repository builds it by joining `library.resource` (foundation, read-only) with `catalog.dataset`.

### The DB module — rows and typed tables

```ts
// server/src/services/Catalog/catalog.db.ts
export namespace CatalogDB {

    export namespace Dataset {
        export const Row = z.object({
            rid:  Catalog.Dataset.Rid,
            type: z.literal('dataset'),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row, resource: LibraryDB.Resource.Row, latest: …) =>
            Catalog.Dataset.Schema.parse({ ...LibraryDB.Resource.toBase(resource), … });
    }

    // Transaction, TransactionFile, Branch, Outbox — same pattern

    export interface Tables extends LibraryDB.ReadTables, IdentityDB.ReadTables {
        'catalog.dataset':          Table<typeof Dataset.Row>;
        'catalog.branch':           Table<typeof Branch.Row, 'created_at'>;
        'catalog.transaction':      Table<typeof Transaction.Row, 'started_at'>;
        'catalog.transaction_change': Table<typeof TransactionChange.Row>;
        'catalog.outbox':           Table<typeof Outbox.Row, 'id' | 'created_at'>;
    }
}
```

### What a `*.db.ts` file holds

One per Postgres schema (the counterpart of PretzelCloud's `db/portal/index.ts`) — the only place that knows the schema's physical shape:

1. **Row schemas** — zod, snake_case, column for column; parse what Kysely returns.
2. **`toDomain` mappers** — row → shared domain model (`LibraryDB.Resource.toFolder`, …). Index-only tables (`resource_ancestor`) have rows but no `toDomain`.
3. **Table types** — `Tables` (own repositories: read + write) and, for foundation schemas, `ReadTables` (other services: read only).
4. **Transaction openers** — `asUser` / `asService`, which `@Transactional` calls; `asUser` sets `app.user_rid` for audit, not RLS.

All `*.db.ts` modules share the one pool in `db/pool.ts` — they differ only in TypeScript type.

`ReadTables` types foundation tables with `ColumnType<T, never, never>` — selecting compiles, inserting or updating doesn't. So `CatalogDB` can join `library.resource` but can't write it — except through **`@EnsureResource`**.

### Creating a resource subtype — `@EnsureResource`

A dataset (or source) is one thing split across two schemas: its `library.resource` row and its own row. **The owning service is the entry point** — `CatalogService.createDataset`, not Library — and its repository's create method declares the library row as part of it:

```ts
@Transactional()
@EnsureResource('dataset')                 // inserts library.resource first, in this same transaction
async create(principal: Principal, values: { rid, name, description, parentRid }) {
    await this.trx.insertInto('catalog.dataset')…     // the subtype's own rows
    return toDomain(dataset, this.resource);          // this.resource: the library row it just wrote, like this.trx
}
```

Both commit or neither (verified: a body that throws after both inserts leaves no library row). The SQL stays Library's (`library.statements.insertResource`, the one cast to `LibraryDB.Tables`); `@EnsureResource` must sit under `@Transactional` (wrong order fails with a clear error), the method's second parameter must carry `rid, name, description, parentRid` (compile-time), and the parent must be live (404 otherwise). Projects and folders are Library's own: `ResourceRepository.createContainer`.

---

## 6. Layers and rules

```mermaid
flowchart LR
    controller[Controller] --> service[Service] --> repository[Repository] --> pg[("Postgres<br/>own schema + foundation reads")]
```

| Layer | Owns |
|---|---|
| **Controller** | zod in/out; builds the `Principal` |
| **Service** | `@SecurityGate`; business rules, orchestration; object storage, queues, events |
| **Repository** | `@Transactional`; one transaction per method, principal first; SQL for one schema; row → domain |

| Rule | Enforced by |
|---|---|
| `@SecurityGate` on services, `@Transactional` on repositories, never both | Review; decorator target types |
| Trashed resources read as absent: `@Transactional` 404s unless every top-level library-resource RID argument exists, isn't trashed, and has no trashed ancestor (one query, same transaction). Exempt a parameter with `@AllowTrashed()` (restore, purge, trash listing) | Runtime, detected by value (`Library.Resource.Rid` pattern) — so resources you act on are top-level parameters, payloads are objects |
| Names say what they hold: `rid`, `parentRid`, `datasetRid`, `sourceRid` — never `…Id` for a RID | Review |
| Repositories never call other repositories; `@Transactional` doesn't nest | Runtime throw (PretzelCloud pattern) |
| A repository touches only its own schema (+ foundation reads) | `Repository(CatalogDB)` typing |
| Services import other services' **public services**, never their repositories or `.db.ts` | Lint (`eslint-plugin-boundaries` or `dependency-cruiser`) |
| Pass the caller's principal service → service → repository; background work for a user is a delegate; `Principal.SELF` only for system work | Review; greppable reasons |

### Allowed dependencies between services

```mermaid
flowchart LR
    dc[DataConnection] --> catalog[Catalog] --> gatekeeper[Gatekeeper] --> library[Library] --> identity[Identity]
```

An arrow means "may import / call" — never the other way. On top of that, every service may **read** the foundation schemas' tables (`identity`, `library`), and everything may use `Foundations` (shared).

- **Identity** depends on nothing.
- **Library** reads Identity (`created_by`).
- **Gatekeeper** reads Library ancestry and Identity membership.
- **Catalog** uses Library (statements) and Gatekeeper.
- **DataConnection** uses Library, Gatekeeper and `CatalogService` (`catalog.transaction`) to write datasets.

No cycles: a service never depends on one to its right.

---

## 7. Walkthrough: running a sync

| Step | Where | Runs as |
|---|---|---|
| `POST /api/sources/:rid/syncs/:syncRid/run` | `data-connection.controller.ts` → AuthGuard builds `Principal.User` | user |
| Check `write` on the source and on the output dataset | `DataConnectionService.runSync` (`@SecurityGate('write')` on the source + explicit `assert` on the dataset) | user |
| Enqueue `DataConnection.Queue.Sync` (deduplicated by `syncRid`) | `DataConnectionService` via `QueueManager.add` (`infra/queue.ts`) | — |
| **— sync-worker —** | | |
| Pick up job, parse payload, load the sync | `runtime/sync.processor.ts` (`JobProcessor`) → `SyncRunner.run` | `SELF('sync.load')` — only now is it known who the run acts for |
| Decide the actor | `Principal.onBehalfOf(job.triggeredBy ?? sync.created_by, 'sync:<syncRid>')` | **delegate** of whoever pressed run (manual) or the sync's creator (scheduled) |
| Insert `sync_run` (unique running per sync) | `SyncRunRepository.start` | delegate |
| Open dataset transaction — Gatekeeper checks `write` on the dataset **as that user** | `catalog.transaction.open` (`@SecurityGate('write')`) → `TransactionRepository.open` | delegate (`started_by` = the user) |
| Resolve secret, `COPY (SELECT …) TO s3://…`; heartbeat every 30 s | `runtime/sync.runner.ts` + `runtime/adapters/postgres.adapter.ts` + `infra/duckdb.ts` | — |
| Register files + schema, commit (+ outbox event) | `catalog.transaction.registerChanges` / `commit` (`transaction/dataset-transactions.ts`) | delegate |
| Mark run succeeded with `cursor_to` | `SyncRunRepository.succeed` | delegate |
| Publish `catalog.dataset-updated` (**system-worker**) | `outbox/outbox.processor.ts` (`Catalog.Queue.OutboxRelay`) → BullMQ | `SELF` |

On failure: abort the transaction and mark the run failed — as `SELF('sync.cleanup')`, so cleanup succeeds even if the user lost access mid-run; `storage-gc.processor.ts` later removes the orphaned files. If the sync worker dies mid-run, `sync-reaper.processor.ts` (system-worker) does the same for runs stuck in `running`.

---

## 8. Not in this layout yet

- **Ontology** (object types, links, edits, index) — the next layer, after transforms.
- **Transforms / builds / lineage** — and the Python transform runtime they probably need.
- **Frontend.**
- **Markings** (mandatory controls) — wait for lineage.
- **Audit log** — see [gatekeeper.md §10](gatekeeper.md#10-open-questions).
