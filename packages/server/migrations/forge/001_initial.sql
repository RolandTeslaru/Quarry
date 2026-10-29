-- 001_initial — the `forge` schema.
--
-- Forge: recipes (how to compute datasets, published by producers), builds and
-- their jobs (docs/design/forge.md). None of them is a library resource.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/forge.md.

CREATE SCHEMA IF NOT EXISTS forge;

-- RID types, built on foundations.rid. Datasets and producers are other services' resources,
-- referenced through library.resource (rule 3); transactions are Catalog's, with no FK.
CREATE DOMAIN forge.recipe_rid AS foundations.rid CHECK (VALUE LIKE 'ri.forge.main.recipe.%');
CREATE DOMAIN forge.build_rid    AS foundations.rid CHECK (VALUE LIKE 'ri.forge.main.build.%');
CREATE DOMAIN forge.job_rid      AS foundations.rid CHECK (VALUE LIKE 'ri.forge.main.job.%');

-- ── recipes ────────────────────────────────────────────────────────────

-- Immutable: one row per publish, never updated.
CREATE TABLE forge.recipe (
    rid           forge.recipe_rid PRIMARY KEY,
    producer_rid  foundations.rid NOT NULL REFERENCES library.resource (rid) ON DELETE RESTRICT,   -- the workspace (later: pipeline)
    branch        text NOT NULL,
    driver        jsonb NOT NULL,                 -- Forge.Recipe.Driver: which driver runs it, and what that driver needs
    resources     jsonb NOT NULL,                 -- Forge.Recipe.Resources
    published_by  identity.user_rid REFERENCES identity.user(rid),
    published_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recipe_producer ON forge.recipe (producer_rid, branch);

CREATE TABLE forge.recipe_input_dataset (
    recipe_rid    forge.recipe_rid NOT NULL REFERENCES forge.recipe(rid) ON DELETE CASCADE,
    dataset_rid   foundations.rid NOT NULL REFERENCES library.resource (rid) ON DELETE RESTRICT
                  CHECK (dataset_rid LIKE 'ri.catalog.main.dataset.%'),
    PRIMARY KEY (recipe_rid, dataset_rid)
);

CREATE INDEX recipe_input_dataset_reader ON forge.recipe_input_dataset (dataset_rid);   -- what reads this dataset

CREATE TABLE forge.recipe_output_dataset (
    recipe_rid    forge.recipe_rid NOT NULL REFERENCES forge.recipe(rid) ON DELETE CASCADE,
    dataset_rid   foundations.rid NOT NULL REFERENCES library.resource (rid) ON DELETE RESTRICT
                  CHECK (dataset_rid LIKE 'ri.catalog.main.dataset.%'),
    PRIMARY KEY (recipe_rid, dataset_rid)
);

-- The pointer: which recipe computes this dataset on this branch. The key is "one producer per dataset per branch".
CREATE TABLE forge.current_recipe (
    dataset_rid   foundations.rid NOT NULL REFERENCES library.resource (rid) ON DELETE CASCADE
                  CHECK (dataset_rid LIKE 'ri.catalog.main.dataset.%'),
    branch        text NOT NULL,
    recipe_rid    forge.recipe_rid NOT NULL REFERENCES forge.recipe(rid) ON DELETE RESTRICT,
    PRIMARY KEY (dataset_rid, branch)
);

CREATE INDEX current_recipe_by_recipe ON forge.current_recipe (recipe_rid);

-- ── builds and jobs ──────────────────────────────────────────────────────

CREATE TABLE forge.build (
    rid               forge.build_rid PRIMARY KEY,
    branch            text NOT NULL,
    fallback_branches text[] NOT NULL DEFAULT '{}',
    target            jsonb NOT NULL,             -- Forge.Build.Target: { type, datasetRids, inputRids? }
    plan              jsonb NOT NULL,             -- Forge.Build.Plan: { roots, children } — fixed at creation
    force_build       boolean NOT NULL DEFAULT false,
    abort_on_failure  boolean NOT NULL DEFAULT false,
    retry_count       integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'canceled')),
    created_by        identity.user_rid REFERENCES identity.user(rid),   -- NULL = the system
    created_at        timestamptz NOT NULL DEFAULT now(),
    finished_at       timestamptz,
    CHECK ((status = 'running') = (finished_at IS NULL))
);

CREATE INDEX build_target  ON forge.build USING gin ((target -> 'datasetRids'));   -- builds of this dataset
CREATE INDEX build_latest  ON forge.build (created_at DESC);

CREATE TABLE forge.job (
    rid           forge.job_rid PRIMARY KEY,
    build_rid     forge.build_rid NOT NULL REFERENCES forge.build(rid) ON DELETE CASCADE,
    recipe_rid    forge.recipe_rid NOT NULL REFERENCES forge.recipe(rid) ON DELETE RESTRICT,
    status        text NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'scheduled', 'running', 'succeeded', 'failed', 'canceled')),
    attempt       integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
    failure       jsonb,                          -- { message }
    inputs        jsonb,                          -- { <dataset rid>: <transaction rid> }: the versions it read, pinned when it starts
    outputs       jsonb NOT NULL,                 -- { <dataset rid>: <transaction rid> }: opened when the build is created
    scheduled_at  timestamptz,                    -- may run from here: a root at initialization, a child when its last parent finished — its message added to foundations.outbox
    started_at    timestamptz,                    -- a ForgeAgent took it
    heartbeat_at  timestamptz,                    -- not indexed, so heartbeats stay HOT updates
    finished_at   timestamptz,
    CHECK ((status IN ('succeeded', 'failed', 'canceled')) = (finished_at IS NOT NULL)),
    CHECK (status NOT IN ('running', 'succeeded', 'failed') OR started_at IS NOT NULL),
    UNIQUE (build_rid, recipe_rid)                -- one job per node of the plan
);

-- ── row-level security (gatekeeper/001_initial.sql explains the setup) ─────
--
-- A recipe is its producer's: seen with discover on it, published with write on it — plus
-- read on each input and write on each output. A build is seen by whoever can discover one of
-- its targets, and created or changed by whoever can write all of them; its jobs follow it.

-- A recipe's producer, a build's targets — whatever the user can see — for the policies below.
CREATE FUNCTION forge.producer_of(p_recipe text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT producer_rid FROM forge.recipe WHERE rid = p_recipe
$$;

CREATE FUNCTION forge.targets_of(p_build text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT ARRAY(SELECT jsonb_array_elements_text(target -> 'datasetRids')) FROM forge.build WHERE rid = p_build
$$;

-- Discover on any target.
CREATE FUNCTION forge.sees(p_targets text[]) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_targets) AS target WHERE gatekeeper.can(target, 'discover'))
$$;

-- Write on every target.
CREATE FUNCTION forge.writes(p_targets text[]) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT NOT EXISTS (SELECT 1 FROM unnest(p_targets) AS target WHERE NOT gatekeeper.can(target, 'write'))
$$;

ALTER TABLE forge.recipe ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON forge.recipe FOR SELECT TO quarry_user USING (gatekeeper.can(producer_rid, 'discover'));
CREATE POLICY publish  ON forge.recipe FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(producer_rid, 'write'));

ALTER TABLE forge.recipe_input_dataset ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON forge.recipe_input_dataset FOR SELECT TO quarry_user
    USING (gatekeeper.can(forge.producer_of(recipe_rid), 'discover'));
CREATE POLICY publish  ON forge.recipe_input_dataset FOR INSERT TO quarry_user
    WITH CHECK (gatekeeper.can(forge.producer_of(recipe_rid), 'write') AND gatekeeper.can(dataset_rid, 'read'));

ALTER TABLE forge.recipe_output_dataset ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON forge.recipe_output_dataset FOR SELECT TO quarry_user
    USING (gatekeeper.can(forge.producer_of(recipe_rid), 'discover'));
CREATE POLICY publish  ON forge.recipe_output_dataset FOR INSERT TO quarry_user
    WITH CHECK (gatekeeper.can(forge.producer_of(recipe_rid), 'write') AND gatekeeper.can(dataset_rid, 'write'));

ALTER TABLE forge.current_recipe ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON forge.current_recipe FOR SELECT TO quarry_user USING (gatekeeper.can(dataset_rid, 'discover'));
CREATE POLICY point    ON forge.current_recipe FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(dataset_rid, 'write'));
CREATE POLICY unpoint  ON forge.current_recipe FOR DELETE TO quarry_user USING (gatekeeper.can(dataset_rid, 'write'));

ALTER TABLE forge.build ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON forge.build FOR SELECT TO quarry_user
    USING (forge.sees(ARRAY(SELECT jsonb_array_elements_text(target -> 'datasetRids'))));
CREATE POLICY create_  ON forge.build FOR INSERT TO quarry_user
    WITH CHECK (forge.writes(ARRAY(SELECT jsonb_array_elements_text(target -> 'datasetRids'))));
CREATE POLICY change   ON forge.build FOR UPDATE TO quarry_user
    USING (forge.writes(ARRAY(SELECT jsonb_array_elements_text(target -> 'datasetRids'))))
    WITH CHECK (forge.writes(ARRAY(SELECT jsonb_array_elements_text(target -> 'datasetRids'))));

ALTER TABLE forge.job ENABLE ROW LEVEL SECURITY;
CREATE POLICY discover ON forge.job FOR SELECT TO quarry_user USING (forge.sees(forge.targets_of(build_rid)));
CREATE POLICY create_  ON forge.job FOR INSERT TO quarry_user WITH CHECK (forge.writes(forge.targets_of(build_rid)));
CREATE POLICY change   ON forge.job FOR UPDATE TO quarry_user
    USING (forge.writes(forge.targets_of(build_rid))) WITH CHECK (forge.writes(forge.targets_of(build_rid)));

GRANT USAGE ON SCHEMA forge TO quarry_user;
GRANT SELECT, INSERT ON forge.recipe, forge.recipe_input_dataset, forge.recipe_output_dataset TO quarry_user;
GRANT SELECT, INSERT, DELETE ON forge.current_recipe TO quarry_user;
GRANT SELECT, INSERT, UPDATE ON forge.build, forge.job TO quarry_user;
