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

-- ── row-level security (gatekeeper/001_initial.sql explains the setup) ─────
--
-- The dataset and its branch are metadata (discover); transactions and their file
-- changes are contents (read); writing any of them is write on the dataset.

-- The dataset a transaction belongs to, whatever the user can see — for the change rows' policies.
CREATE FUNCTION catalog.dataset_of(p_transaction text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT dataset_rid FROM catalog.transaction WHERE rid = p_transaction
$$;

ALTER TABLE catalog.dataset ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON catalog.dataset FOR SELECT TO quarry_user USING (gatekeeper.can(rid, 'discover'));
CREATE POLICY create_  ON catalog.dataset FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(rid, 'write'));

ALTER TABLE catalog.branch ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON catalog.branch FOR SELECT TO quarry_user USING (gatekeeper.can(dataset_rid, 'discover'));
CREATE POLICY create_  ON catalog.branch FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(dataset_rid, 'write'));
CREATE POLICY change   ON catalog.branch FOR UPDATE TO quarry_user
    USING (gatekeeper.can(dataset_rid, 'write')) WITH CHECK (gatekeeper.can(dataset_rid, 'write'));

ALTER TABLE catalog.transaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY read    ON catalog.transaction FOR SELECT TO quarry_user USING (gatekeeper.can(dataset_rid, 'read'));
CREATE POLICY open    ON catalog.transaction FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(dataset_rid, 'write'));
CREATE POLICY finish  ON catalog.transaction FOR UPDATE TO quarry_user             -- commit, abort
    USING (gatekeeper.can(dataset_rid, 'write')) WITH CHECK (gatekeeper.can(dataset_rid, 'write'));

ALTER TABLE catalog.transaction_change ENABLE ROW LEVEL SECURITY;
CREATE POLICY read     ON catalog.transaction_change FOR SELECT TO quarry_user
    USING (gatekeeper.can(catalog.dataset_of(transaction_rid), 'read'));
CREATE POLICY register ON catalog.transaction_change FOR INSERT TO quarry_user
    WITH CHECK (gatekeeper.can(catalog.dataset_of(transaction_rid), 'write'));

GRANT USAGE ON SCHEMA catalog TO quarry_user;
GRANT SELECT, INSERT ON catalog.dataset, catalog.transaction_change TO quarry_user;
GRANT SELECT, INSERT, UPDATE ON catalog.branch, catalog.transaction TO quarry_user;
-- The outbox: users only append (a commit writes its event); the relay reads it as the system.
GRANT INSERT ON catalog.outbox TO quarry_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA catalog TO quarry_user;
