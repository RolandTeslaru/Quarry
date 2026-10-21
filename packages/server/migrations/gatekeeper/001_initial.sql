-- 001_initial — the `gatekeeper` schema.
--
-- Role grants, the effective-rank functions, the permission epoch, and row-level security
-- for library and its own tables. Installs epoch triggers and RLS policies on
-- library.resource and identity.* — Gatekeeper is their consumer.
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
-- SECURITY DEFINER: it reads grants and ancestry that RLS hides from the user — and the
-- policies themselves call it, so it must not be subject to them.
CREATE FUNCTION gatekeeper.effective_ranks(p_resources foundations.rid[], p_user identity.user_rid)
RETURNS TABLE (resource_rid foundations.rid, rank integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
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

CREATE FUNCTION gatekeeper.bump_epoch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

-- ── row-level security ──────────────────────────────────────────────────
--
-- User and delegate transactions run as quarry_user with app.user_rid set (pool.ts);
-- every policy asks `gatekeeper.can(<resource>, '<action>')` for that user. On-the-fly:
-- the rank is computed per row (no materialised access table yet). Service work runs as
-- the owner, which RLS doesn't restrict.

-- The current user's effective rank on a resource; 0 without a user (or for NULL).
CREATE FUNCTION gatekeeper.my_rank(p_resource text) RETURNS integer
LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT coalesce((
        SELECT r.rank
          FROM gatekeeper.effective_ranks(
                   ARRAY[p_resource]::foundations.rid[],
                   nullif(current_setting('app.user_rid', true), '')::identity.user_rid) AS r
         WHERE p_resource IS NOT NULL), 0)
$$;

-- What a policy asks for — mirrors Gatekeeper.Action (shared/domain/Gatekeeper/Action.ts).
-- A typo ('raed') fails the domain check instead of silently denying.
CREATE DOMAIN gatekeeper.action AS text CHECK (VALUE IN ('discover', 'read', 'write', 'manage'));

-- May the current user do this to the resource? Action.MINIMUM_RANK: discover 1 · read 2 · write 3 · manage 4.
CREATE FUNCTION gatekeeper.can(p_resource text, p_action gatekeeper.action) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT gatekeeper.my_rank(p_resource) >= CASE p_action
        WHEN 'discover' THEN 1
        WHEN 'read'     THEN 2
        WHEN 'write'    THEN 3
        WHEN 'manage'   THEN 4
    END
$$;

CREATE FUNCTION gatekeeper.i_am_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1 FROM identity.user
         WHERE rid = nullif(current_setting('app.user_rid', true), '')
           AND workspace_role = 'admin'
           AND deactivated_at IS NULL)
$$;

-- library.resource: metadata is discover. A new row is checked through its parent too —
-- its own ancestry rows are written by an AFTER trigger, after this check runs.
ALTER TABLE library.resource ENABLE ROW LEVEL SECURITY;

CREATE POLICY discover ON library.resource FOR SELECT TO quarry_user
    USING (gatekeeper.can(rid, 'discover') OR gatekeeper.can(parent_rid, 'discover'));

CREATE POLICY create_in_parent ON library.resource FOR INSERT TO quarry_user
    WITH CHECK (CASE WHEN parent_rid IS NULL THEN gatekeeper.i_am_admin()        -- projects: admins only
                     ELSE gatekeeper.can(parent_rid, 'write') END);

CREATE POLICY change ON library.resource FOR UPDATE TO quarry_user              -- rename, move, trash
    USING (gatekeeper.can(rid, 'write'))
    WITH CHECK (gatekeeper.can(rid, 'write'));
-- A move also needs write on the new parent: library.check_parent enforces it (it sees OLD; a policy can't).

-- library.resource_ancestor: readable where the resource is; written only by the definer triggers.
ALTER TABLE library.resource_ancestor ENABLE ROW LEVEL SECURITY;

CREATE POLICY discover ON library.resource_ancestor FOR SELECT TO quarry_user
    USING (gatekeeper.can(resource_rid, 'discover'));

-- gatekeeper.role_grant: who has access is read; changing it is manage.
ALTER TABLE gatekeeper.role_grant ENABLE ROW LEVEL SECURITY;

CREATE POLICY read   ON gatekeeper.role_grant FOR SELECT TO quarry_user USING (gatekeeper.can(resource_rid, 'read'));
CREATE POLICY grant_ ON gatekeeper.role_grant FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(resource_rid, 'manage'));
CREATE POLICY regrant ON gatekeeper.role_grant FOR UPDATE TO quarry_user
    USING (gatekeeper.can(resource_rid, 'manage')) WITH CHECK (gatekeeper.can(resource_rid, 'manage'));
CREATE POLICY revoke ON gatekeeper.role_grant FOR DELETE TO quarry_user USING (gatekeeper.can(resource_rid, 'manage'));

GRANT USAGE ON SCHEMA gatekeeper TO quarry_user;
GRANT SELECT ON gatekeeper.role TO quarry_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON gatekeeper.role_grant TO quarry_user;
