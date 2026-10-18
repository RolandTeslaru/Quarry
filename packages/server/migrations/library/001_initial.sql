-- 001_initial — the `library` schema.
--
-- Resource identity, the folder tree, and its closure table (trigger-maintained).
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS library;

-- Registry of resource types and which service owns each
CREATE TABLE library.resource_type (
    type          text PRIMARY KEY,                -- 'project' | 'folder' | 'dataset' | 'source' | …
    service       text NOT NULL,                   -- 'library' | 'catalog' | 'data-connection'
    is_container  boolean NOT NULL DEFAULT false   -- can have children (project, folder)
);

INSERT INTO library.resource_type VALUES
    ('project', 'library',         true),
    ('folder',  'library',         true),
    ('dataset', 'catalog',         false),
    ('source',  'data-connection', false);

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
