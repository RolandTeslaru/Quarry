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

CREATE TABLE data_connection.source (
    rid           data_connection.source_rid PRIMARY KEY,
    type          text NOT NULL DEFAULT 'source' CHECK (type = 'source'),
    definition_id text NOT NULL CHECK (definition_id ~ '^[a-z][a-z0-9-]*$'),   -- 'postgres', … — defined in code (sources/)
    config        jsonb NOT NULL,                 -- validated against the definition's Config; never credential values

    -- the Keychain credential it logs in with, referenced through library (rule 3); NULL iff the definition takes none
    credential_rid foundations.rid REFERENCES library.resource (rid) ON DELETE RESTRICT
                   CHECK (credential_rid LIKE 'ri.keychain.main.credential.%'),

    -- where its syncs' datasets go unless a sync says otherwise: a project or folder; NULL = the source's own folder
    output_folder_rid foundations.rid REFERENCES library.resource (rid) ON DELETE SET NULL
                      CHECK (output_folder_rid LIKE 'ri.library.main.project.%' OR output_folder_rid LIKE 'ri.library.main.folder.%'),

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

-- ── row-level security (gatekeeper/001_initial.sql explains the setup) ─────
--
-- Access to a sync or a run is access to its source: syncs are listed with discover,
-- runs are contents (read). Naming a credential needs read on it — use; creating a
-- sync needs write on the source and on its output dataset.

-- The source a sync belongs to, whatever the user can see — for the run rows' policies.
CREATE FUNCTION data_connection.source_of(p_sync text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT source_rid FROM data_connection.sync WHERE rid = p_sync
$$;

ALTER TABLE data_connection.source ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON data_connection.source FOR SELECT TO quarry_user USING (gatekeeper.can(rid, 'discover'));
CREATE POLICY create_  ON data_connection.source FOR INSERT TO quarry_user
    WITH CHECK (gatekeeper.can(rid, 'write')
                AND (credential_rid IS NULL OR gatekeeper.can(credential_rid, 'read')));

ALTER TABLE data_connection.sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON data_connection.sync FOR SELECT TO quarry_user USING (gatekeeper.can(source_rid, 'discover'));
CREATE POLICY create_  ON data_connection.sync FOR INSERT TO quarry_user
    WITH CHECK (gatekeeper.can(source_rid, 'write') AND gatekeeper.can(output_dataset_rid, 'write'));

-- Runs: started and finished by the run's delegate (manual: whoever pressed run; scheduled: the sync's creator).


GRANT USAGE ON SCHEMA data_connection TO main_user;
GRANT SELECT, INSERT ON data_connection.source, data_connection.sync TO main_user;

-- ── the service's roles: data_connection_service, data_connection_user (foundations.create_service_roles) ──
SELECT foundations.create_service_roles('data_connection', ARRAY['source']);
