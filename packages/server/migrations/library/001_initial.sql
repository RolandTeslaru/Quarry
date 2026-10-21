-- 001_initial — the `library` schema.
--
-- Resource identity, the folder tree, and its closure table (trigger-maintained).
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS library;

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

CREATE TABLE library.resource_ancestor (
    resource_rid foundations.rid NOT NULL REFERENCES library.resource(rid) ON DELETE CASCADE,
    ancestor_rid foundations.rid NOT NULL REFERENCES library.resource(rid) ON DELETE CASCADE,
    depth        integer NOT NULL CHECK (depth >= 0),
    PRIMARY KEY (resource_rid, ancestor_rid)
);

CREATE INDEX resource_ancestor_by_ancestor ON library.resource_ancestor (ancestor_rid, depth);

-- Trigger functions are SECURITY DEFINER: they must see the whole tree and write the
-- closure table, whatever the user's row-level access (RLS: gatekeeper/001_initial.sql).

-- Parent must be a container; a move must not create a cycle, and a user moving
-- something needs write on the new parent (RLS policies can't see the old row, so
-- they can't tell a move from a rename — this trigger fires only on a parent change).
-- gatekeeper.can is defined later, by gatekeeper/001_initial.sql; plpgsql resolves it when it runs.
CREATE FUNCTION library.check_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

    IF TG_OP = 'UPDATE'
       AND coalesce(current_setting('app.user_rid', true), '') <> ''          -- a user, not the system
       AND NOT gatekeeper.can(NEW.parent_rid, 'write') THEN
        RAISE EXCEPTION 'no write access to %', NEW.parent_rid USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER resource_check_parent
    BEFORE INSERT OR UPDATE OF parent_rid ON library.resource
    FOR EACH ROW EXECUTE FUNCTION library.check_parent();

-- New resource: itself + every ancestor of its parent.
CREATE FUNCTION library.ancestry_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
CREATE FUNCTION library.ancestry_move() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

-- Live: it exists, isn't trashed, and no ancestor is. SECURITY DEFINER: liveness must see
-- ancestors the user can't (a trashed folder above a shared dataset still hides it).
CREATE FUNCTION library.is_live(p_rid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (SELECT 1 FROM library.resource r WHERE r.rid = p_rid)
       AND NOT EXISTS (
           SELECT 1
             FROM library.resource_ancestor a
             JOIN library.resource anc ON anc.rid = a.ancestor_rid
            WHERE a.resource_rid = p_rid
              AND anc.trashed_at IS NOT NULL)
$$;

GRANT USAGE ON SCHEMA library TO quarry_user;
GRANT SELECT ON library.resource_type, library.resource_ancestor TO quarry_user;
GRANT SELECT, INSERT, UPDATE ON library.resource TO quarry_user;
-- RLS on library.resource and resource_ancestor is installed by gatekeeper/001_initial.sql,
-- which defines the rank function the policies call.
