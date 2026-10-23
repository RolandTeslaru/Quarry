# Database Design

_Draft, 2026-10-13. Covers `identity`, `library`, `gatekeeper`, `keychain`, `catalog` and `data_connection`. Concepts are in [catalog.md](catalog.md), [data-connection.md](data-connection.md), [keychain.md](keychain.md) and [gatekeeper.md](gatekeeper.md); Foundry background in the [research notes](../research/palantir-foundry-ontology.md)._

---

## 1. Layout

**One Postgres database per workspace, one Postgres schema per service.** The app is a single-workspace silo — no tenant columns anywhere. A Postgres schema is a namespace inside a database (`schema.table`).

```
workspace database (`quarry`)
├── foundations       the `rid` domain type — migrated first
├── identity          users and groups of this workspace       (foundation: every service may read)
├── library           resource identity, folder tree, ancestry (foundation: every service may read)
├── gatekeeper        role grants, permission epoch
├── keychain          credentials, encrypted at rest
├── catalog           datasets, branches, transactions, files
├── data_connection   sources, syncs, sync runs
└── audit             access events, append-only — see audit.md
    (later: code_repository, ontology, …)

GoTrue keeps its tables in its own database (`gotrue`, schema `auth`) on the same Postgres server,
created by docker/postgres/init. We never read it — we only verify its JWTs.
```

### Rules

1. **Each service writes only its own schema.** Enforced at compile time: each service's repositories are typed against a database module that only knows its own tables (plus read-only foundation tables).
2. **No cross-service joins in queries.** Services talk to each other through code. Exception: the foundation schemas (`identity`, `library`) may be read by anyone.
3. **Cross-schema foreign keys point only at foundation tables** — `identity.user`, `identity.group`, `library.resource`. Never `catalog` ↔ `data_connection` directly; a reference to another service's resource goes through `library.resource(id, type)`.
4. **Resource creation is one database transaction**: the library row and the service's subtype row together — the owning service's repository declares it with `@EnsureResource('<type>')` (architecture.md §5).

Following 2 and 3 means a schema can be moved to its own database later as a migration, not a rewrite.

### Conventions

- **Enumerations**: `text` + `CHECK` (or a small lookup table), not Postgres `ENUM` types — values can be added and removed with a plain migration.
- **Timestamps**: `timestamptz`, UTC.
- **Flexible config**: `jsonb`, validated in the application (zod) per variant.
- **Names**: `snake_case`, singular table names. `identity.user` and `identity.group` are reserved words in Postgres but valid when schema-qualified; Kysely always quotes identifiers.
- **Actors**: `*_by` columns reference `identity.user(rid)` (a user RID), filled by repositories from the principal; `NULL` means a service principal (the system acting on its own).

---

## 2. Resource IDs (RIDs)

Every library resource has a globally unique, self-describing ID:

```
ri.<service>.<instance>.<type>.<locator>

ri.library.main.project.0192f3a1-7c2e-7b4d-9a10-3f5e8c2d1b6a
ri.library.main.folder.…
ri.catalog.main.dataset.…
ri.catalog.main.transaction.…
ri.data-connection.main.source.…
```

| Segment | Meaning |
|---|---|
| `service` | Owning service — tells you who to ask about it |
| `instance` | Always `main`; kept so IDs stay unique if workspaces are ever federated |
| `type` | Resource type; must equal `library.resource.type` for library resources |
| `locator` | UUIDv7 (time-ordered → index-friendly), generated in the application |

Stored as `text`, typed `foundations.rid`. **Anything addressable from outside its table gets a RID** — anything in an API path, a job payload, a log line or another service's column: library resources, dataset transactions, syncs (`ri.data-connection.main.sync.…`) and sync runs (`…sync-run.…`), and the principals grants are given to: users (`ri.identity.main.user.<GoTrue user id>` — wraps GoTrue's UUID one-to-one) and groups (`ri.identity.main.group.<uuidv7>`). Users, groups, syncs and runs are RIDs but **not** library resources (no tree, grants or trash of their own). Rows that only describe something else don't: `role_grant` keeps a surrogate `uuid`, `catalog.outbox` a `bigint` identity, `transaction_change` and `group_member` have composite keys.

**Typed in SQL too.** Each RID type is a domain built on `foundations.rid`, adding only the prefix check, the same layering as the TypeScript types: `identity.user_rid`, `identity.group_rid`, `catalog.dataset_rid`, `catalog.transaction_rid`, `data_connection.source_rid` / `sync_rid` / `sync_run_rid`. A column typed `data_connection.sync_rid` rejects a source RID. Domains are used in their own schema, and identity's everywhere, since identity is a foundation schema. Columns pointing into another service's schema stay `foundations.rid` (rule 3); their FK through `library.resource (rid, type)` checks the type. `library.resource.rid` stays `foundations.rid` because a resource can be any type, and its `split_part(rid, '.', 4) = type` check covers it.

**Naming follows the value:** a column holding a RID is `rid` / `<thing>_rid` (`parent_rid`, `dataset_rid`, `user_rid`); a local key is `id`. Actor columns stay `*_by`. TypeScript uses the same names in camelCase (`parentRid`), so rows map to domain objects without renaming.

### TypeScript types

Template literal types — not a brand — so the hierarchy comes for free: a dataset RID *is* a resource RID *is* a RID, with no casts. Three levels:

```ts
// Foundations — any RID; shared by every service
export namespace Foundations {
    type Uuid = `${string}-${string}-${string}-${string}-${string}`;
    export type Rid<S extends string = string, T extends string = string> = `ri.${S}.main.${T}.${Uuid}`;
    // + Rid.create(service, type), Rid.parse(rid), Rid.generateSchema(service, type) — zod regex at boundaries
}

// Library — RIDs of library resources (mirrors library.resource_type)
export namespace Library.Resource {
    export type Type = 'project' | 'folder' | 'dataset' | 'source' | 'credential';
    export type Rid  = Foundations.Rid<string, Type>;
}

// Each service — its own concrete RIDs
export namespace Dataset     { export type Rid = Foundations.Rid<'catalog', 'dataset'>; }
export namespace Transaction { export type Rid = Foundations.Rid<'catalog', 'transaction'>; }   // a RID, not a resource
```

| Assignment | Result |
|---|---|
| `Dataset.Rid` → `Foundations.Rid` / `Library.Resource.Rid` | ok |
| `Transaction.Rid` → `Library.Resource.Rid` | compile error — can't be handed to Gatekeeper |
| `Folder.Rid` → `Dataset.Rid` | compile error |
| `string` or generic `Foundations.Rid` → `Dataset.Rid` | compile error — narrow with `Rid.generateSchema(...).parse` |

Validation (the regex) runs where input enters: zod at controllers and in database row schemas.

```sql
CREATE SCHEMA foundations;

-- shared format check, reused by every RID column — in its own schema, migrated first,
-- because identity (users, groups) needs it before library exists
CREATE DOMAIN foundations.rid AS text
    CHECK (VALUE ~ '^ri\.[a-z][a-z-]*\.[a-z][a-z0-9-]*\.[a-z][a-z-]*\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
```

---

## 3. `identity`

Who is in this workspace. Authentication (passwords, sessions, JWTs) is GoTrue's, in the `auth` schema; a user exists here only if they've been added to the workspace. See [gatekeeper.md §2](gatekeeper.md#2-authentication-vs-authorization).

```sql
CREATE SCHEMA identity;

-- RID types, built on foundations.rid (which checks the format). A foundation
-- schema, so every service may use these.
CREATE DOMAIN identity.user_rid  AS foundations.rid CHECK (VALUE LIKE 'ri.identity.main.user.%');
CREATE DOMAIN identity.group_rid AS foundations.rid CHECK (VALUE LIKE 'ri.identity.main.group.%');

CREATE TABLE identity.user (
    rid             identity.user_rid PRIMARY KEY,   -- ri.identity.main.user.<GoTrue user id> (no FK: auth is GoTrue's database)
    email           text NOT NULL,
    display_name    text NOT NULL,
    workspace_role  text NOT NULL DEFAULT 'member' CHECK (workspace_role IN ('member', 'admin')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    deactivated_at  timestamptz
);

CREATE UNIQUE INDEX user_email ON identity.user (lower(email));

CREATE TABLE identity.group (
    rid          identity.group_rid PRIMARY KEY,
    name         text NOT NULL,
    description  text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX group_name ON identity.group (lower(name));

CREATE TABLE identity.group_member (
    group_rid identity.group_rid NOT NULL REFERENCES identity.group(rid) ON DELETE CASCADE,
    user_rid  identity.user_rid  NOT NULL REFERENCES identity.user(rid)  ON DELETE CASCADE,
    added_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_rid, user_rid)
);

CREATE INDEX group_member_by_user ON identity.group_member (user_rid);
```

Users are deactivated, not deleted, so `*_by` references stay valid.

---

## 4. `library`

Authoritative for what **every** resource shares: identity, type, name, location, lifecycle. Holds no type-specific data and is **not** a projection of other schemas. Permissions live in `gatekeeper`.

```sql
CREATE SCHEMA library;

-- Registry of resource types: which can hold children, which the explorer lists
CREATE TABLE library.resource_type (
    type              text PRIMARY KEY,                -- 'project' | 'folder' | 'dataset' | 'source' | 'credential' | …
    is_container      boolean NOT NULL DEFAULT false,  -- can have children (project, folder)
    show_in_explorer  boolean NOT NULL DEFAULT true    -- listed by the library explorer; credentials live in Keychain
);

INSERT INTO library.resource_type VALUES
    ('project',    true,  true),
    ('folder',     true,  true),
    ('dataset',    false, true),
    ('source',     false, true),
    ('credential', false, false);

CREATE TABLE library.resource (
    rid         foundations.rid PRIMARY KEY,
    type        text NOT NULL REFERENCES library.resource_type(type),
    name        text NOT NULL CHECK (name <> '' AND name !~ '/'),
    description text,
    parent_rid  foundations.rid REFERENCES library.resource(rid) ON DELETE RESTRICT,

    created_by  identity.user_rid REFERENCES identity.user(rid),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    trashed_by  identity.user_rid REFERENCES identity.user(rid),
    trashed_at  timestamptz,

    UNIQUE (rid, type),                                         -- target for subtype FKs
    CHECK (split_part(rid, '.', 4) = type),                     -- RID type segment matches
    CHECK ((type = 'project') = (parent_rid IS NULL))           -- projects are roots, nothing else is
);

-- Names unique among live siblings (trashed resources don't block reuse)
CREATE UNIQUE INDEX resource_sibling_name
    ON library.resource (parent_rid, lower(name))
    WHERE trashed_at IS NULL AND parent_rid IS NOT NULL;

CREATE UNIQUE INDEX resource_project_name
    ON library.resource (lower(name))
    WHERE trashed_at IS NULL AND parent_rid IS NULL;

CREATE INDEX resource_parent ON library.resource (parent_rid);
```

**Paths** (`/Factory/raw/sap_tools`) are derived from the ancestry below — never stored, so moves and renames touch one row.

### Ancestry (closure table)

Every (resource, ancestor) pair, including the resource itself at depth 0. Gatekeeper uses it for inherited permissions; Library uses it for paths and subtree queries. Maintained by triggers, so it can't drift from `parent_rid`.

```sql
CREATE TABLE library.resource_ancestor (
    resource_rid foundations.rid NOT NULL REFERENCES library.resource(rid) ON DELETE CASCADE,
    ancestor_rid foundations.rid NOT NULL REFERENCES library.resource(rid) ON DELETE CASCADE,
    depth        integer NOT NULL CHECK (depth >= 0),
    PRIMARY KEY (resource_rid, ancestor_rid)
);

CREATE INDEX resource_ancestor_by_ancestor ON library.resource_ancestor (ancestor_rid, depth);

-- Parent must be a container; a move must not create a cycle.
CREATE FUNCTION library.check_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.parent_rid IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT (SELECT t.is_container FROM library.resource p
              JOIN library.resource_type t ON t.type = p.type
             WHERE p.rid = NEW.parent_rid) THEN
        RAISE EXCEPTION 'parent % is not a container', NEW.parent_rid;
    END IF;

    IF TG_OP = 'UPDATE' AND EXISTS (
        SELECT 1 FROM library.resource_ancestor
         WHERE resource_rid = NEW.parent_rid AND ancestor_rid = NEW.rid) THEN
        RAISE EXCEPTION 'moving % under % would create a cycle', NEW.rid, NEW.parent_rid;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER resource_check_parent
    BEFORE INSERT OR UPDATE OF parent_rid ON library.resource
    FOR EACH ROW EXECUTE FUNCTION library.check_parent();

-- New resource: itself + every ancestor of its parent.
CREATE FUNCTION library.ancestry_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO library.resource_ancestor (resource_rid, ancestor_rid, depth)
    SELECT NEW.rid, NEW.rid, 0
    UNION ALL
    SELECT NEW.rid, a.ancestor_rid, a.depth + 1
      FROM library.resource_ancestor a
     WHERE a.resource_rid = NEW.parent_rid;
    RETURN NULL;
END $$;

CREATE TRIGGER resource_ancestry_insert
    AFTER INSERT ON library.resource
    FOR EACH ROW EXECUTE FUNCTION library.ancestry_insert();

-- Move: detach the subtree from its old ancestors, attach it to the new parent's.
CREATE FUNCTION library.ancestry_move() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM library.resource_ancestor ra
     USING library.resource_ancestor sub
     WHERE sub.ancestor_rid = NEW.rid                      -- ra.resource_rid is in the moved subtree
       AND ra.resource_rid = sub.resource_rid
       AND ra.ancestor_rid NOT IN (                       -- ra.ancestor_rid is outside it
           SELECT resource_rid FROM library.resource_ancestor WHERE ancestor_rid = NEW.rid);

    INSERT INTO library.resource_ancestor (resource_rid, ancestor_rid, depth)
    SELECT sub.resource_rid, sup.ancestor_rid, sub.depth + sup.depth + 1
      FROM library.resource_ancestor sub
      JOIN library.resource_ancestor sup ON sup.resource_rid = NEW.parent_rid
     WHERE sub.ancestor_rid = NEW.rid;

    RETURN NULL;
END $$;

CREATE TRIGGER resource_ancestry_move
    AFTER UPDATE OF parent_rid ON library.resource
    FOR EACH ROW WHEN (OLD.parent_rid IS DISTINCT FROM NEW.parent_rid)
    EXECUTE FUNCTION library.ancestry_move();
```

### Lifecycle

1. **Trash** — set `trashed_at`. Library hides the resource and its descendants (any ancestor trashed → hidden); restorable.
2. **Purge** — the owning service deletes its subtype rows and storage, then the library row is deleted. `ON DELETE RESTRICT` guarantees the library row can't vanish while a service still holds data for it.

---

## 5. `gatekeeper`

Role grants and the permission epoch. Behaviour, API and caching are in [gatekeeper.md](gatekeeper.md).

```sql
CREATE SCHEMA gatekeeper;

CREATE TABLE gatekeeper.role (
    name  text PRIMARY KEY,
    rank  integer NOT NULL UNIQUE CHECK (rank > 0)
);

INSERT INTO gatekeeper.role VALUES
    ('discoverer', 1),
    ('viewer',     2),
    ('editor',     3),
    ('owner',      4);

CREATE TABLE gatekeeper.role_grant (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- surrogate; a grant is identified by (resource, subject)
    resource_rid foundations.rid NOT NULL REFERENCES library.resource(rid) ON DELETE CASCADE,
    user_rid     identity.user_rid  REFERENCES identity.user(rid)  ON DELETE CASCADE,
    group_rid    identity.group_rid REFERENCES identity.group(rid) ON DELETE CASCADE,
    role         text NOT NULL REFERENCES gatekeeper.role(name),
    granted_by   identity.user_rid REFERENCES identity.user(rid),
    granted_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(user_rid, group_rid) = 1)          -- exactly one subject
);

CREATE UNIQUE INDEX role_grant_user  ON gatekeeper.role_grant (resource_rid, user_rid)  WHERE user_rid IS NOT NULL;
CREATE UNIQUE INDEX role_grant_group ON gatekeeper.role_grant (resource_rid, group_rid) WHERE group_rid IS NOT NULL;
CREATE INDEX role_grant_by_user  ON gatekeeper.role_grant (user_rid)  WHERE user_rid IS NOT NULL;
CREATE INDEX role_grant_by_group ON gatekeeper.role_grant (group_rid) WHERE group_rid IS NOT NULL;
```

### Effective rank

The whole permission rule, in one place. `0` = no access.

```sql
-- Ranks of one user on many resources: admins 4, deactivated/unknown 0,
-- otherwise the highest grant on the resource or any ancestor, to the user or their groups.
CREATE FUNCTION gatekeeper.effective_ranks(p_resources foundations.rid[], p_user identity.user_rid)
RETURNS TABLE (resource_rid foundations.rid, rank integer)
LANGUAGE sql STABLE AS $$
    WITH u AS (
        SELECT workspace_role, deactivated_at FROM identity.user WHERE rid = p_user
    )
    SELECT r.rid::foundations.rid,
           CASE
               WHEN NOT EXISTS (SELECT 1 FROM u WHERE deactivated_at IS NULL) THEN 0
               WHEN EXISTS (SELECT 1 FROM u WHERE workspace_role = 'admin')   THEN 4
               ELSE coalesce((
                   SELECT max(ro.rank)
                     FROM library.resource_ancestor a
                     JOIN gatekeeper.role_grant g ON g.resource_rid = a.ancestor_rid
                     JOIN gatekeeper.role ro      ON ro.name = g.role
                    WHERE a.resource_rid = r.rid
                      AND (g.user_rid = p_user
                           OR g.group_rid IN (SELECT group_rid FROM identity.group_member WHERE user_rid = p_user))
               ), 0)
           END
      FROM unnest(p_resources) AS r(rid)
$$;

CREATE FUNCTION gatekeeper.effective_rank(p_resource foundations.rid, p_user identity.user_rid)
RETURNS integer LANGUAGE sql STABLE AS $$
    SELECT rank FROM gatekeeper.effective_ranks(ARRAY[p_resource], p_user)
$$;
```

### Permission epoch

A single counter bumped — in the same transaction — by anything that can change a decision. Cache invalidation hook; see [gatekeeper.md §7](gatekeeper.md#7-cost-and-caching). Gatekeeper's migrations install these triggers on the foundation tables, since Gatekeeper is the consumer.

```sql
CREATE TABLE gatekeeper.epoch (
    singleton  boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    value      bigint NOT NULL DEFAULT 0
);

INSERT INTO gatekeeper.epoch DEFAULT VALUES;

CREATE FUNCTION gatekeeper.bump_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    next bigint;
BEGIN
    UPDATE gatekeeper.epoch SET value = value + 1 RETURNING value INTO next;
    PERFORM pg_notify('gatekeeper_epoch', next::text);
    RETURN NULL;
END $$;

CREATE TRIGGER epoch_on_grant
    AFTER INSERT OR UPDATE OR DELETE ON gatekeeper.role_grant
    FOR EACH STATEMENT EXECUTE FUNCTION gatekeeper.bump_epoch();

CREATE TRIGGER epoch_on_move
    AFTER UPDATE OF parent_rid ON library.resource
    FOR EACH STATEMENT EXECUTE FUNCTION gatekeeper.bump_epoch();

CREATE TRIGGER epoch_on_membership
    AFTER INSERT OR UPDATE OR DELETE ON identity.group_member
    FOR EACH STATEMENT EXECUTE FUNCTION gatekeeper.bump_epoch();

CREATE TRIGGER epoch_on_user
    AFTER UPDATE OF workspace_role, deactivated_at ON identity.user
    FOR EACH STATEMENT EXECUTE FUNCTION gatekeeper.bump_epoch();
```

---

## 5b. `keychain`

Credentials — logins to external systems. Each is a library resource of type `credential` (hidden from the explorer: `show_in_explorer = false`). Concepts in [keychain.md](keychain.md).

```sql
CREATE SCHEMA keychain;

CREATE DOMAIN keychain.credential_rid AS foundations.rid CHECK (VALUE LIKE 'ri.keychain.main.credential.%');

CREATE TABLE keychain.credential (
    rid          keychain.credential_rid PRIMARY KEY,
    type         text NOT NULL DEFAULT 'credential' CHECK (type = 'credential'),
    template_id  text NOT NULL CHECK (template_id ~ '^[a-z][a-z0-9-]*$'),   -- 'postgres', … — declared in code (integrations/<System>/credential.ts)
    blob         text NOT NULL,                   -- every value, encrypted together: keyId:iv:authTag:ciphertext — never plain text
    updated_by   identity.user_rid REFERENCES identity.user(rid),          -- who last set the values
    updated_at   timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT
);
```

Sources reference a credential through `library.resource` (rule 3): `data_connection.source.credential_rid`.

---

## 6. `catalog`

Datasets as versioned file sets. Files live in object storage; this schema is authoritative for which files make up each version.

```sql
CREATE SCHEMA catalog;

-- RID types, built on foundations.rid. Catalog's own; other schemas reference
-- datasets as foundations.rid through library.resource (rule 3).
CREATE DOMAIN catalog.dataset_rid     AS foundations.rid CHECK (VALUE LIKE 'ri.catalog.main.dataset.%');
CREATE DOMAIN catalog.transaction_rid AS foundations.rid CHECK (VALUE LIKE 'ri.catalog.main.transaction.%');

CREATE TABLE catalog.dataset (
    rid             catalog.dataset_rid PRIMARY KEY,
    type            text NOT NULL DEFAULT 'dataset' CHECK (type = 'dataset'),
    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT
);

CREATE TABLE catalog.branch (
    dataset_rid       catalog.dataset_rid NOT NULL REFERENCES catalog.dataset(rid) ON DELETE CASCADE,
    name              text NOT NULL,                          -- 'main' only for now
    last_sequence     bigint NOT NULL DEFAULT 0,              -- sequence of the latest committed transaction
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (dataset_rid, name)
);

CREATE TABLE catalog.transaction (
    rid           catalog.transaction_rid PRIMARY KEY,
    dataset_rid   catalog.dataset_rid NOT NULL,
    branch        text NOT NULL,
    type          text NOT NULL CHECK (type IN ('snapshot', 'append', 'update', 'delete')),
    status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'committed', 'aborted')),
    sequence      bigint,                                     -- set on commit: 1, 2, 3… per branch
    schema        jsonb,                                      -- the resulting view's { columns, reader } (Catalog.ColumnSchema.Schema); NULL = unchanged
    provenance    jsonb NOT NULL DEFAULT '{}',                -- e.g. { "syncRunRid": "…" }

    started_by    identity.user_rid REFERENCES identity.user(rid),          -- NULL = service principal
    started_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,

    FOREIGN KEY (dataset_rid, branch) REFERENCES catalog.branch (dataset_rid, name) ON DELETE CASCADE,
    UNIQUE (dataset_rid, branch, sequence),
    CHECK ((status = 'committed') = (sequence IS NOT NULL)),
    CHECK ((status = 'open') = (finished_at IS NULL))
);

-- At most one open transaction per dataset branch
CREATE UNIQUE INDEX transaction_one_open
    ON catalog.transaction (dataset_rid, branch)
    WHERE status = 'open';

-- A transaction's change list: add a stored file at a logical path, or remove a path.
-- The file columns (format, key, bytes, row_count) are a Storage.File; NULL for 'remove'.
CREATE TABLE catalog.transaction_change (
    transaction_rid catalog.transaction_rid NOT NULL REFERENCES catalog.transaction(rid) ON DELETE CASCADE,
    logical_path    text NOT NULL,                            -- the file's name within the dataset
    op              text NOT NULL CHECK (op IN ('add', 'remove')),
    format          text CHECK (format IN ('parquet', 'csv')),
    key             text,                                     -- object storage key, write-once
    bytes           bigint,
    row_count       bigint,                                   -- from a parquet footer; NULL for csv (not counted on upload)
    PRIMARY KEY (transaction_rid, logical_path),
    CHECK ((op = 'add')    = (format IS NOT NULL AND key IS NOT NULL AND bytes IS NOT NULL)),
    CHECK ((op = 'remove') = (format IS NULL AND key IS NULL AND bytes IS NULL AND row_count IS NULL))
);
```

### Commit

One Postgres transaction, after all files are uploaded and registered:

```sql
BEGIN;
  SELECT last_sequence FROM catalog.branch
   WHERE dataset_rid = $1 AND name = $2 FOR UPDATE;          -- serialises commits per branch
  UPDATE catalog.branch SET last_sequence = last_sequence + 1 WHERE …;
  UPDATE catalog.transaction
     SET status = 'committed', sequence = <new>, finished_at = now()
   WHERE rid = $txn AND status = 'open';
  INSERT INTO catalog.outbox (event, payload) VALUES ('dataset.updated', …);
COMMIT;
```

### View resolution

For a branch at sequence _N_: take the latest committed `snapshot` with `sequence ≤ N`, then apply every committed transaction after it up to _N_, in sequence order (adds/removes by `logical_path`). Schema = latest non-NULL `schema` in that range.

```sql
CREATE INDEX transaction_view
    ON catalog.transaction (dataset_rid, branch, sequence)
    WHERE status = 'committed';
```

### Schema column format (`transaction.schema`)

```json
[
  { "name": "tool_id",    "type": "string",       "nullable": false },
  { "name": "price",      "type": "decimal(12,2)", "nullable": true },
  { "name": "updated_at", "type": "timestamp",    "nullable": true }
]
```

Stored as `jsonb` and validated in the application against the type system in [catalog.md](catalog.md#schema-type-system).

### Outbox

Events for other services (`dataset.updated` → downstream builds, reindexing), written in the same transaction as the change and published afterwards:

```sql
CREATE TABLE catalog.outbox (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event         text NOT NULL,
    payload       jsonb NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    published_at  timestamptz
);

CREATE INDEX outbox_unpublished ON catalog.outbox (id) WHERE published_at IS NULL;
```

---

## 7. `data_connection`

External systems and the syncs that copy them into datasets.

```sql
CREATE SCHEMA data_connection;

-- RID types, built on foundations.rid.
CREATE DOMAIN data_connection.source_rid   AS foundations.rid CHECK (VALUE LIKE 'ri.data-connection.main.source.%');
CREATE DOMAIN data_connection.sync_rid     AS foundations.rid CHECK (VALUE LIKE 'ri.data-connection.main.sync.%');
CREATE DOMAIN data_connection.sync_run_rid AS foundations.rid CHECK (VALUE LIKE 'ri.data-connection.main.sync-run.%');

CREATE TABLE data_connection.source (
    rid           data_connection.source_rid PRIMARY KEY,
    type          text NOT NULL DEFAULT 'source' CHECK (type = 'source'),
    definition_id text NOT NULL CHECK (definition_id ~ '^[a-z][a-z0-9-]*$'),   -- 'postgres', … — defined in code (sources/)
    config        jsonb NOT NULL,                 -- validated against the definition's Config; never credential values

    -- the Keychain credential it logs in with, referenced through library (rule 3); NULL iff the definition takes none
    credential_rid foundations.rid REFERENCES library.resource (rid) ON DELETE RESTRICT
                   CHECK (credential_rid LIKE 'ri.keychain.main.credential.%'),

    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT
);

CREATE INDEX source_credential ON data_connection.source (credential_rid) WHERE credential_rid IS NOT NULL;

CREATE TABLE data_connection.sync (
    rid                 data_connection.sync_rid PRIMARY KEY,
    source_rid          data_connection.source_rid NOT NULL REFERENCES data_connection.source(rid) ON DELETE CASCADE,
    name                text NOT NULL,
    config              jsonb NOT NULL,           -- the source integration's sync Config, validated by the server:
                                                  -- { "kind": "table", "schema": "public", "table": "tools" } | { "kind": "query", "sql": "…" }

    -- output dataset: a catalog resource, referenced through library (rule 3). The FK says it exists;
    -- the RID prefix says it's a dataset (library keeps each resource's RID type segment = its type).
    output_dataset_rid  foundations.rid NOT NULL REFERENCES library.resource (rid) ON DELETE RESTRICT
                        CHECK (output_dataset_rid LIKE 'ri.catalog.main.dataset.%'),

    schedule            text,                     -- cron expression; NULL = manual only
    enabled             boolean NOT NULL DEFAULT true,
    created_by          identity.user_rid REFERENCES identity.user(rid),
    created_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE (output_dataset_rid),                   -- a raw dataset has exactly one writing sync
    UNIQUE (source_rid, name)
);

CREATE TABLE data_connection.sync_run (
    rid              data_connection.sync_run_rid PRIMARY KEY,
    sync_rid         data_connection.sync_rid NOT NULL REFERENCES data_connection.sync(rid) ON DELETE CASCADE,
    status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
    transaction_rid  foundations.rid,                 -- catalog transaction; no FK (rule 3)
    state_from     text,                     -- the previous successful run's state_to; opaque to all but the integration
    state_to         text,                     -- what the next run starts from (e.g. a high-water mark)
    row_count        bigint,
    error            jsonb,
    trigger          text NOT NULL CHECK (trigger IN ('manual', 'schedule')),
    triggered_by     identity.user_rid REFERENCES identity.user(rid),   -- NULL for scheduled runs
    started_at       timestamptz NOT NULL DEFAULT now(),
    heartbeat_at     timestamptz NOT NULL DEFAULT now(),  -- runner updates ~every 30 s; the reaper's "is it alive" signal
    finished_at      timestamptz,
    CHECK ((status = 'running') = (finished_at IS NULL))
);

-- At most one running run per sync
CREATE UNIQUE INDEX sync_run_one_running
    ON data_connection.sync_run (sync_rid)
    WHERE status = 'running';

CREATE INDEX sync_run_latest ON data_connection.sync_run (sync_rid, started_at DESC);
```

A run is **stuck** when it's still `running` but `heartbeat_at` is minutes old — see [jobs.md](jobs.md#reaper).

Syncs are **not** library resources: they live under their source and have no independent name, location or permissions. A sync's current state (e.g. its incremental high-water mark) is the `state_to` of the latest succeeded run.

`sync_run.transaction_rid` has no FK on purpose — it's another service's internal record, not a library resource. The catalog side records the link back in `transaction.provenance`.

---

## 8. Database roles and row-level security

**Row-level security is the base layer** (decided 2026-10-21). Gatekeeper's services still check first — for proper 403s and object storage, which RLS can't cover — and Postgres refuses anything they miss.

| Role | Used by | Access |
|---|---|---|
| The connecting role (`DATABASE_URL`) | Migrations; **service** transactions (system work) | Owns every schema; as owner it isn't subject to RLS |
| `quarry_user` (NOLOGIN, created by `foundations/001`) | **User and delegate** transactions: `asUser` runs `SET LOCAL ROLE quarry_user` after `set_config('app.user_rid', …)` | `SELECT`/`INSERT`/`UPDATE` per table as needed, filtered by RLS; `INSERT` only on `catalog.outbox` |
| GoTrue's own role | GoTrue | `auth` only |

**How a policy decides.** `gatekeeper.can(rid, 'read')` — the SQL twin of `GatekeeperService.can` — compares the current user's effective rank (`gatekeeper.my_rank`: `effective_ranks` with `app.user_rid`; 0 without a user) with the action's minimum (`gatekeeper.action`: discover · read · write · manage, mirroring `Gatekeeper.Action`; a misspelt action fails the domain check). Computed per row, on the fly — a materialised access table can replace it later without changing the policies:

| Rows | SELECT | INSERT / UPDATE |
|---|---|---|
| `library.resource` | discover (on itself or its parent) | create: write on the parent (projects: admins); rename / move / trash: write — plus write on a new parent for a move, checked by the `check_parent` trigger (a policy can't see the old row) |
| `library.resource_ancestor` | discover | — (definer triggers only) |
| `gatekeeper.role_grant` | read | manage |
| `catalog.dataset`, `catalog.branch`, `keychain.credential`, `data_connection.source` | discover | write (a source naming a credential also needs read on it) |
| `data_connection.sync` | discover on the source | write on the source **and** on the output dataset |
| `catalog.transaction`, `catalog.transaction_change` | read on the dataset | write on the dataset |
| `data_connection.sync_run` | read on the source | read on the source (runs act as their delegate) |

Not resource-scoped, so no RLS: `identity.*` (admin-checked in the server), `library.resource_type`, `gatekeeper.role`, `gatekeeper.epoch`, `catalog.outbox` (users can only append to it).

**SECURITY DEFINER functions** see past RLS where they must: `gatekeeper.effective_ranks` (the policies call it), `library.is_live` (liveness must see trashed ancestors the user can't), the library ancestry triggers, `gatekeeper.bump_epoch`, `catalog.dataset_of`, `data_connection.source_of`.

What RLS does to errors: hidden rows are simply absent — a get is a 404, an UPDATE or DELETE that touches nothing is a 404 too (`requireAffected`): *doesn't exist, or not yours*. A refused insert or update raises SQLSTATE 42501, which `catchDatabaseErrors` maps to 403. A create under a parent that exists but is hidden is a 404, not a 403 (`@EnsureResource` checks the parent is visible), so a refused create never reveals a hidden resource.

Service boundaries (rule 1) are enforced at compile time by typed database modules, not by Postgres roles. If a service is ever split into its own process, it gets its own role with grants on its schema plus `SELECT` on the foundation schemas.

---

## 9. Migrations

**Kysely `Migrator`** with a `.sql` file provider (PretzelCloud's), one instance per schema, each with its own folder and its own tracking table (`migrationTableSchema`) — so every schema carries its own history and can move to its own database with its migrations. Applied in dependency order by `packages/server/src/db/migrator.ts`; the **API runs them on boot** (workers never migrate), or `npm run migrate`. A service's migrations may reference the foundation schemas and its own schema only (Gatekeeper's also install the epoch triggers on foundation tables).

Until launch each schema has one living `001_initial.sql` — schema changes edit it rather than add files; numbered append-only migrations start the day a database exists that can't be dropped. The SQL blocks in this document are the source; the migrations were generated from them.

```
packages/server/migrations/
  foundations/      001_initial.sql   → foundations.kysely_migration
  identity/         001_initial.sql   → identity.kysely_migration
  library/          001_initial.sql   → library.kysely_migration
  gatekeeper/       001_initial.sql   → gatekeeper.kysely_migration
  catalog/          001_initial.sql   → catalog.kysely_migration
  data_connection/  001_initial.sql   → data_connection.kysely_migration
```

Where each schema's tables are used in code (DB modules, repositories) is in [architecture.md §4](architecture.md#4-where-every-table-lives).

- Postgres runs pending migrations in a transaction — a failed migration rolls back.
- Query types (`Database` interface) are separate from migrations: hand-written or generated with `kysely-codegen` from the migrated database; multi-schema tables are keyed `"catalog.transaction"`.

---

## 10. Open questions

- **Outbox delivery** — the relay polls every 5 s; commits already `pg_notify('catalog_outbox')`. Switch the relay to `LISTEN` as the wake-up signal (polling kept as a fallback)?

_Settled:_ trash cascades by ancestry — only the trashed resource gets `trashed_at`; descendants are hidden because an ancestor is trashed, and `@Transactional` 404s on them (architecture.md §6).
- **Large file lists** — snapshots with tens of thousands of files: is `transaction_change` enough, or do we need manifest files in object storage (Iceberg-style)?
- **Encryption key rotation** — one `QUARRY_ENCRYPTION_KEY` per workspace; rotating means re-encrypting every `keychain.credential.blob` (keychain.md §4).
- **GoTrue user sync** — copy email from GoTrue on login, or treat `identity.user.email` as authoritative?
