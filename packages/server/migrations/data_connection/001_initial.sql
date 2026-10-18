-- 001_initial — the `data_connection` schema.
--
-- Sources, syncs and sync runs.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS data_connection;

-- RID types, built on foundations.rid.
CREATE DOMAIN data_connection.source_rid   AS foundations.rid CHECK (VALUE LIKE 'ri.data-connection.main.source.%');
CREATE DOMAIN data_connection.sync_rid     AS foundations.rid CHECK (VALUE LIKE 'ri.data-connection.main.sync.%');
CREATE DOMAIN data_connection.sync_run_rid AS foundations.rid CHECK (VALUE LIKE 'ri.data-connection.main.sync-run.%');

CREATE TABLE data_connection.source (
    rid           data_connection.source_rid PRIMARY KEY,
    type          text NOT NULL DEFAULT 'source' CHECK (type = 'source'),
    kind          text NOT NULL CHECK (kind IN ('postgres', 'mysql', 's3', 'rest')),
    config        jsonb NOT NULL,                 -- host, port, database, … — validated per kind
    secret_ref    text,                           -- name resolved at runtime; never the credential
    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT
);

CREATE TABLE data_connection.sync (
    rid                 data_connection.sync_rid PRIMARY KEY,
    source_rid          data_connection.source_rid NOT NULL REFERENCES data_connection.source(rid) ON DELETE CASCADE,
    name                text NOT NULL,
    target              jsonb NOT NULL,           -- { "kind": "table", "schema": "public", "table": "tools" }
                                                  -- | { "kind": "query", "sql": "…" }
    mode                text NOT NULL CHECK (mode IN ('snapshot', 'append')),
    cursor_column       text,                     -- required for 'append'

    -- output dataset: a catalog resource, referenced through library (rule 3)
    output_dataset_rid  foundations.rid NOT NULL,     -- type checked by the FK below
    output_dataset_type text NOT NULL DEFAULT 'dataset' CHECK (output_dataset_type = 'dataset'),

    schedule            text,                     -- cron expression; NULL = manual only
    enabled             boolean NOT NULL DEFAULT true,
    created_by          identity.user_rid REFERENCES identity.user(rid),
    created_at          timestamptz NOT NULL DEFAULT now(),

    FOREIGN KEY (output_dataset_rid, output_dataset_type)
        REFERENCES library.resource (rid, type) ON DELETE RESTRICT,
    UNIQUE (output_dataset_rid),                   -- a raw dataset has exactly one writing sync
    UNIQUE (source_rid, name),
    CHECK ((mode = 'append') = (cursor_column IS NOT NULL))
);

CREATE TABLE data_connection.sync_run (
    rid              data_connection.sync_run_rid PRIMARY KEY,
    sync_rid         data_connection.sync_rid NOT NULL REFERENCES data_connection.sync(rid) ON DELETE CASCADE,
    status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
    transaction_rid  foundations.rid,                 -- catalog transaction; no FK (rule 3)
    cursor_from      text,
    cursor_to        text,                        -- next run starts here (append mode)
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
