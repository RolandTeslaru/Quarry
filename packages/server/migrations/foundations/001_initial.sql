-- 001_initial — the `foundations` schema.
--
-- The RID type every schema uses, and the database role user work runs as. Migrated first.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS foundations;

-- shared format check, reused by every RID column — in its own schema, migrated first,
-- because identity (users, groups) needs it before library exists
CREATE DOMAIN foundations.rid AS text
    CHECK (VALUE ~ '^ri\.[a-z][a-z-]*\.[a-z][a-z0-9-]*\.[a-z][a-z-]*\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Row-level security: user and delegate transactions run as quarry_user (`SET LOCAL ROLE`
-- in pool.ts), so every schema's RLS policies apply to them. System work stays on the
-- connecting role — the owner of the tables — which RLS doesn't restrict.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quarry_user') THEN
        CREATE ROLE quarry_user NOLOGIN;
    END IF;
END $$;

GRANT quarry_user TO CURRENT_USER;          -- so the app's connection may SET ROLE to it
GRANT USAGE ON SCHEMA foundations TO quarry_user;
