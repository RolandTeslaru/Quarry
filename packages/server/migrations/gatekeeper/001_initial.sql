-- 001_initial — the `gatekeeper` schema.
--
-- Role grants, the effective-rank functions, and the permission epoch.
-- Installs epoch triggers on library.resource and identity.* — Gatekeeper is their consumer.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS gatekeeper;

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
