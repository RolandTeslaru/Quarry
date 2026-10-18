-- 001_initial — the `catalog` schema.
--
-- Datasets as versioned file sets; the files live in object storage (Storage.File).
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS catalog;

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
    schema        jsonb,                                      -- column list of the resulting view; NULL = unchanged
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
    format          text CHECK (format IN ('parquet')),
    key             text,                                     -- object storage key, write-once
    bytes           bigint,
    row_count       bigint,                                   -- parquet only
    PRIMARY KEY (transaction_rid, logical_path),
    CHECK ((op = 'add')    = (format IS NOT NULL AND key IS NOT NULL AND bytes IS NOT NULL)),
    CHECK ((op = 'remove') = (format IS NULL AND key IS NULL AND bytes IS NULL AND row_count IS NULL))
);

CREATE INDEX transaction_view
    ON catalog.transaction (dataset_rid, branch, sequence)
    WHERE status = 'committed';

CREATE TABLE catalog.outbox (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event         text NOT NULL,
    payload       jsonb NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    published_at  timestamptz
);

CREATE INDEX outbox_unpublished ON catalog.outbox (id) WHERE published_at IS NULL;
