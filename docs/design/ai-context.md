# Quarry — context handoff for AI assistants

A dump of what has been researched, decided, built and verified so far, plus
judgement on where things stand. Read this first, then the design docs it
points to. Written 2026-10-18.

**Ground rules for working with this user**
- Build on settled decisions below; don't re-propose alternatives unless asked.
- The user iterates on naming and code shape and has strong taste: match the
  existing idiom exactly (see §6), propose before large renames.
- Research answers: no "what this means for Typology" sections unless asked.
  Typology (the user's older project) is **not** being ported.
- Nothing is committed yet (repo has no commits; some docs/config are staged).
  Don't commit unless asked.

---

## 1. How we got here

1. **Research phase.** Started from a Palantir Foundry research file
   (`docs/research/palantir-foundry-ontology.md`, now in Quarry). We went deep
   on Foundry's model:
   - Datasets = versioned file collections (Parquet) with transactions
     SNAPSHOT / APPEND / UPDATE / DELETE; branches; views resolved from the last
     snapshot forward.
   - Ontology objects are *backed* by datasets; user edits from Actions go to an
     **edits store**, merged over the backing data and indexed by **Funnel**;
     reindexing happens on backing-dataset change. Writeback datasets export
     edits back out.
   - Data Connection (sources, syncs, agents), Pipeline Builder / transforms,
     lineage, layers (raw → clean → ontology).
   - Compass (filesystem/projects), Gatekeeper (authorization), Multipass
     (identity), markings.
   - Side topics: SAP connectors, Gotham, Microsoft Foundry / Fabric IQ, other
     "ontology" vendors, DuckDB (incl. Kysely + DuckDB), Parquet, Modeling
     Objectives.
2. **Design phase.** The user decided to build **Quarry**: a self-hosted,
   single-workspace ("silo") platform modelled on Foundry's data layer.
   Ontology is deliberately deferred.
3. **Build phase.** Scaffolded a monorepo at `~/Desktop/Quarry`, then a long
   series of refactors to the user's taste (naming, namespaces, decorators,
   principals, liveness).

---

## 2. Settled architecture

| Area | Decision |
|---|---|
| Tenancy | Silo: one deployment = one workspace. No tenant columns. An `identity.user` row = workspace member. |
| Shape | Five packages: `shared` (domain, zod namespaces, API + queue contracts) · `integrations` (per external system: definition.ts + runtime.ts) · `server` (the CRUD backend — the **only** package with database access) · `data-connection-worker` · `system-worker` (both own packages, never import the server; they call `/api/internal/…` with a service token). One image. |
| Processes | `server` (HTTP, runs migrations on boot, `/api/internal/…` for workers) · `data-connection-worker` (only process with source-system access + DuckDB; decrypts Keychain credentials it receives encrypted; no DB; runs syncs and `source-probe` test/explore) · `system-worker` (no DB; outbox relay, storage GC, reaper, schedule reconcile via `/internal`). |
| Database | One Postgres DB, **one schema per service**: `foundations` (the `rid` domain type; migrated first), `identity`, `library`, `gatekeeper`, `keychain`, `catalog`, `data_connection`. Cross-schema FKs only to foundation tables (`identity.*`, `library.resource`). |
| Migrations | `.sql` files, `migrations/<schema>/001_initial.sql`, one Kysely Migrator per schema. `docs/design/database.md` is the DDL source of truth. |
| Auth | GoTrue (own `gotrue` database) for authentication; API verifies JWTs locally with jose. First verified login matching `QUARRY_BOOTSTRAP_ADMIN_EMAIL` becomes admin. |
| Authorization | Own **Gatekeeper**: app-level ReBAC checked in services, **plus Postgres RLS as the base layer** (user/delegate transactions `SET LOCAL ROLE quarry_user`; policies call `gatekeeper.can(rid, 'read')`, on the fly; database.md §8). Roles discoverer < viewer < editor < owner; actions discover / read / write / manage. Inheritance via closure table `library.resource_ancestor` (trigger-maintained). Groups supported. Check-then-write race accepted. |
| Library | Compass equivalent. Authoritative for identity, name and tree location of every resource. Subtype tables (dataset, source, credential) share its primary key. `library.resource_type.show_in_explorer` hides credentials from the explorer. Trash = soft delete (`trashed_at`); "live" = not trashed and no trashed ancestor. |
| Data | Datasets = Parquet in S3-compatible storage (SeaweedFS locally — MinIO stopped publishing community images in 2025) + Postgres catalog of transactions/files/branches. DuckDB (`@duckdb/node-api` 1.4.5-r.1) is the sync engine. |
| Jobs | BullMQ 5 + ioredis; Postgres is the source of truth. Outbox → BullMQ with idempotent jobIds. |
| Credentials | **Keychain** (PretzelGraph's Vault, renamed): `Keychain.Credential` = a project-scoped library resource holding one AES-256-GCM blob (workspace key `QUARRY_ENCRYPTION_KEY`, code in `@quarry/shared/server/encryption.ts`); `Keychain.Credential.Template` declared in code on the source definition (`integrations/<System>/credential.ts`), never at runtime. Holds the whole login (host, port, user, password…). read = use, write = change values + reveal. Server hands it to the worker encrypted; the worker decrypts. See keychain.md. |
| Stack | NestJS (server + both workers; workers use @nestjs/bullmq and serve only GET /health), Kysely 0.28, zod 4, npm workspaces, TypeScript 5.9. |

### RIDs
- Format `ri.<service>.main.<type>.<uuid>` — Foundry style.
- Template-literal types: `Foundations.Rid<S,T>` → `Library.Resource.Rid` →
  e.g. `Dataset.Rid`. `Rid.generateSchema`, `ofTypes`, `create`,
  `parse`, `uuidv7`.
- Users: `ri.identity.main.user.<GoTrue sub>`; groups:
  `ri.identity.main.group.<uuidv7>`. Users/groups are RIDs but **not** library
  resources.
- Library resource types: `project`, `folder`, `dataset`, `source`, `credential`.

### Principals
- `user` | `delegate` (background work on behalf of a user; Gatekeeper checks it
  *as that user*) | `service` (`Principal.SELF(reason)`, system work only).
- Services pass the caller's principal down to repositories. Repositories derive
  `*_by` columns with `Principal.actorOf`.
- Scheduled syncs run as `Principal.onBehalfOf(triggeredBy ?? sync.created_by, 'sync:<syncRid>')`,
  so a revoked user's schedule fails "Not found".

---

## 3. Code patterns (the ones the user cares about)

### Layers
Controller (zod in/out) → Service (`@SecurityGate`) → Repository (`@Transactional`) → Postgres (own schema; foundation schemas read-only).
Services import other services' public services, never their repositories or
`*.db.ts`. Repositories never call other repositories.

### Repository (from the user's PretzelCloud project)
```ts
@Injectable()
export class DatasetRepository extends Repository(CatalogDB.database) {
    @Transactional()               // any principal; @Transactional('service') = system-only
    @EnsureResource('dataset')     // writes library.resource first, same transaction
    async create(principal: Principal, values: { rid, name, description, parentRid }) {
        … this.trx …               // AsyncLocalStorage handle
        … this.resource …          // the library row @EnsureResource inserted
    }
}
```
- Principal is always the first parameter. One transaction per outermost call;
  a decorated method called inside one joins it (same principal only — another
  throws), so `open` calls `this.get`.
- `@EnsureResource('<type>')`: the owning service (Catalog for datasets,
  DataConnection for sources) is the entry point for creating its resource.
  Atomic with the subtype row. Must sit under `@Transactional`; compile-time
  check that values carry `rid, name, description, parentRid`; parent must be
  live.

### Liveness (latest change, 2026-10-18)
- **Repository-level, default-on.** `@Transactional` checks, inside the
  transaction, that every top-level argument matching `Library.Resource.Rid`
  (detected **by value** with the regex — no TypeScript metadata) is live;
  otherwise 404. One query (`db/liveness.liveResources`).
- **`@AllowTrashed()` parameter decorator** exempts one parameter, so the user
  can decide incrementally which RIDs may be trashed:
  `restore(principal, @AllowTrashed() rid, parentRid)` still requires a live
  destination.
- Convention that makes this work: **resources you act on are top-level
  parameters; payloads are objects** (RIDs inside objects aren't checked).
- Replaced the earlier service-level `@RequireLive(...indexes)` +
  `LivenessService`, which are deleted.

### Services
- `@SecurityGate('<action>')` only — requires a `gatekeeper: GatekeeperService`
  field; principal first, resource RID second. 404 for both "forbidden" and
  "trashed" so they're indistinguishable.

### Naming conventions
- Classes: `XService`, `XRepository`, `XDB` (namespace per schema in `x.db.ts`
  holding row schemas, `toDomain` mappers, `Tables`/`ReadTables`, database).
- A single repository field is named `repository`; with several,
  `<name>Repository`.
- RIDs are always named `rid` / `parentRid` / `datasetRid` / `sourceRid` /
  `outputDatasetRid` — never `…Id`. DB columns match: `rid`, `parent_rid`,
  `dataset_rid`. Only non-RID keys are `id`: role_grant's internal uuid (never exposed — a grant is identified by resource + subject) and the outbox bigint.
- Infra: `FileStorage` — "file" means an object in storage everywhere
  (`Storage.File`, discriminated by `format`); never "blob"; `QueueManager` (`ensure`,
  `ensureEvents`, shared ioredis for producers) in the server; workers consume with @nestjs/bullmq processors on a typed `JobProcessor` base,
  `GatekeeperService`.
- Shared domain layout: entity files are pure domain; `<Service>.API` in an
  `api/` folder (axios clients, `Request = z.input`); `<Service>.Queue` in a
  `queue/` folder built on `Foundations.Queue` (branded `Name`, `define`,
  `Definition`). Controllers: `import API = <Service>.API;`.

---

## 4. Repo map

```
~/Desktop/Quarry
├── docs/design/        architecture.md · database.md (DDL source) · gatekeeper.md · catalog.md · data-connection.md · jobs.md · ai-context.md (this)
├── docs/research/      palantir-foundry-ontology.md
├── docker-compose.yml  postgres, redis, gotrue, seaweedfs (+ init: creates the bucket)
├── packages/shared/domain/   Foundations · Storage · Identity · Library · Gatekeeper · Catalog · DataConnection
├── packages/integrations/   Postgres/ (definition.ts · runtime.ts) · core/ · definitions.ts (API) · runtimes.ts (Data Connection worker)
├── packages/data-connection-worker/src/    main.ts · worker.module.ts · processors.ts · infra.ts — NestJS, no DB, /health :4101
├── packages/system-worker/src/  main.ts · worker.module.ts · schedules.ts · infra.ts · processors/ — NestJS, no DB, /health :4102
└── packages/server/
    ├── migrations/<schema>/001_initial.sql
    └── src/
        ├── api.ts, api.module.ts, load-env.ts (ENV_FILE override, then root .env)
        ├── auth/       principal.ts · auth.guard.ts · current-principal.ts (@Public, @Internal)
        ├── db/         repository.ts (Repository, @Transactional, @AllowTrashed) · pool.ts · migrator.ts · errors.ts · table.ts
        ├── infra/      redis.ts · queue.ts (producer only) · file-storage.ts
        └── services/
            ├── Identity/        users, groups, /me
            ├── Library/         resource.repository (insert: every library row) · ensure-resource · library.service — liveness in db/liveness.ts
            ├── Gatekeeper/      gatekeeper.service · grant.repository (effective_ranks SQL fn) · security-gate · request-memo
            ├── Catalog/         dataset.repository · transaction/ · outbox/ · internal.controller (outbox, storage-gc)
            └── DataConnection/  controller · internal.controller · service · module · repository (.source · .sync · .run)
```

Run locally: `npm run infra` (Docker) → copy `.env.example` to `.env` →
`npm run dev`. `npm run typecheck` at the root.

---

## 5. What has been verified

Against a throwaway Postgres (port 55432) + redis-server (56379), no Docker:
- Typecheck clean; migrations apply; API + both workers boot.
- Auth, bootstrap admin, Gatekeeper inheritance via groups, RID identities,
  delegate sync runs, actor columns.
- Trash: after trashing a folder, everything inside 404s (get, view, test
  source, run sync, create inside, move into); live siblings unaffected.
- `@AllowTrashed()`: undecorated trashed → 404; decorated trashed → runs;
  mixed `(@AllowTrashed trashed, live)` → runs; `(…, trashed)` → 404.
- `@EnsureResource` atomicity (throwing body leaves no library row),
  wrong-decorator-order error, `this.resource` misuse error.

**Not verified:** a full sync run writing to S3 end to end (DuckDB → SeaweedFS Parquet write/read was verified on its own, 2026-10-22).

---

## 6. Judgement

**What's good**
- The data model is sound and close to Foundry where it matters: transactions
  with snapshot/append semantics, views resolved by sequence, outbox for
  events, Postgres as source of truth with BullMQ as a delivery mechanism.
- Schema-per-service in one database is the right trade for a silo: real
  boundaries without distributed transactions. `@EnsureResource` is a clean
  answer to the one place two schemas must commit together.
- Principals are well thought out. `delegate` in particular avoids the common
  mistake of running user-initiated background work as an all-powerful system
  identity.
- The decorator family (`@Transactional`, `@EnsureResource`, `@AllowTrashed`,
  `@SecurityGate`) is consistent and cheap to read.

**Risks / things to watch**
- **Liveness by value is implicit.** It relies on the convention "acted-on
  RIDs are top-level params". A RID tucked into a payload object silently
  skips the check. Worth a lint rule or a review checklist item.
- **Every `@Transactional` call with a resource RID now costs one extra
  query**, including system paths (outbox, GC, housekeeping). Fine now;
  measure if hot paths appear. System paths that must see trashed data
  (purge, restore, GC of trashed datasets) need `@AllowTrashed()`.
- **Behaviour change:** grant list/put/revoke and `resolveView` on trashed
  resources now 404. Restore/purge flows will need `@AllowTrashed()`.
- **Some redundancy:** `DatasetRepository.get` / `SourceRepository.get` still
  filter `r.trashed_at IS NULL` themselves; harmless, could be removed.
- **Permission failures inside jobs** retry under BullMQ; should throw
  `UnrecoverableError`.
- **Gatekeeper check-then-write race** is accepted by design; revisit if
  grants become high-churn.
- `packages/shared/dist/` exists on disk — make sure it's git-ignored.

---

## 7. Open follow-ups (roughly in priority order)

1. Commit the current state (user's call) — nothing is committed.
2. Verify a full sync run's S3 write path against SeaweedFS (`npm run infra`).
3. `UnrecoverableError` for permission/not-found failures in job processors.
4. Restore and purge flows (first real users of `@AllowTrashed()`); a purge
   counterpart to `@EnsureResource`.
5. ~~Outbox: switch polling to `LISTEN catalog_outbox`.~~ The Catalog outbox was removed (2026-10-29).
6. Undecided idea: replace `workspace_role` with grants on a workspace root.
7. Later: transforms/pipelines, then the Ontology layer (objects backed by
   datasets, edits store, actions, an index like Funnel).
