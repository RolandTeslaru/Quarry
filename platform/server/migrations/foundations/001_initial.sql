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

-- Row-level security. Every policy is written TO quarry_user: a group that holds no privileges,
-- whose members are each process's user role — main_user (the main server), catalog_user (the
-- Catalog service). A user's or delegate's transaction switches to its process's user role
-- (`SET LOCAL ROLE`, pool.ts), so every policy applies; which tables it may touch at all is that
-- role's grants. System work runs on each process's login: the owner for the main server, which
-- RLS doesn't restrict; catalog_service for Catalog, with policies of its own on its own tables
-- (catalog/001_initial.sql). docs/design/architecture-split.md §5.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quarry_user') THEN
        CREATE ROLE quarry_user NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'main_user') THEN
        CREATE ROLE main_user NOLOGIN;
    END IF;
END $$;

GRANT quarry_user TO main_user;             -- the policies apply to it
GRANT main_user TO CURRENT_USER;            -- so the main server's connection may SET ROLE to it
GRANT USAGE ON SCHEMA foundations TO main_user;

-- ── a service's roles (docs/design/architecture-split.md §5) ────────────────
--
-- Called once by each service's own schema's migration, after its tables — `SELECT
-- foundations.create_service_roles('catalog', ARRAY['dataset'])`:
--
--   <schema>_service   the service's login (its password set at boot from <SERVICE>_DATABASE_URL —
--                      db/service-logins.ts) and its own work (Principal.SELF): its schema's tables
--                      whole, the platform's tables read, the outbox it relays, durable events' listeners.
--   <schema>_user      a user's or delegate's transaction in the service: a member of quarry_user, so
--                      every policy applies; its schema's tables (RLS decides what it may do with them —
--                      a command with no policy is refused), the platform's tables read, Library rows
--                      of its own resource types (and new folders), lineage edges, the outbox to append,
--                      durable events to publish.
--
-- Neither can touch another product's schema; that goes through the other service's calls. Kysely's
-- migration history, kept in each schema, isn't the service's: only the main server migrates.
CREATE FUNCTION foundations.create_service_roles(p_schema text, p_resource_types text[]) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    service_role text := p_schema || '_service';
    user_role    text := p_schema || '_user';
    role_name    text;
    own_table    record;
BEGIN
    FOREACH role_name IN ARRAY ARRAY[service_role, user_role] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
        END IF;
    END LOOP;

    EXECUTE format('GRANT quarry_user TO %I', user_role);                       -- the policies apply to it
    EXECUTE format('GRANT %I TO %I', user_role, service_role);                  -- so the service's connection may SET ROLE to it

    -- Both: their schema's tables, the platform's tables read.
    FOREACH role_name IN ARRAY ARRAY[service_role, user_role] LOOP
        EXECUTE format('GRANT USAGE ON SCHEMA foundations, durable, identity, library, gatekeeper, %I TO %I', p_schema, role_name);
        EXECUTE format('GRANT USAGE ON ALL SEQUENCES IN SCHEMA %I TO %I', p_schema, role_name);
        EXECUTE format('GRANT USAGE ON ALL SEQUENCES IN SCHEMA durable TO %I', role_name);
        EXECUTE format('GRANT SELECT ON identity.user, identity.group, identity.group_member TO %I', role_name);
        EXECUTE format('GRANT SELECT ON library.resource_type, library.resource_ancestor TO %I', role_name);
    END LOOP;

    FOR own_table IN
        SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = p_schema AND tablename NOT LIKE 'kysely\_%'
    LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO %I, %I', p_schema, own_table.tablename, service_role, user_role);

        -- The service's own work sees and changes all of its rows — no BYPASSRLS, so nothing elsewhere.
        IF own_table.rowsecurity THEN
            EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL TO %I USING (true) WITH CHECK (true)', service_role, p_schema, own_table.tablename, service_role);
        END IF;
    END LOOP;

    -- The user: Library rows of its types — and new folders — on top of Gatekeeper's policies; never
    -- another product's resource, nor a folder or project changed (the Library's, in the main server).
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON library.resource TO %I', user_role);
    EXECUTE format('CREATE POLICY %I ON library.resource AS RESTRICTIVE FOR INSERT TO %I WITH CHECK (type = ANY (%L::text[]))',
                   p_schema || '_creates', user_role, p_resource_types || ARRAY['folder']);
    EXECUTE format('CREATE POLICY %I ON library.resource AS RESTRICTIVE FOR UPDATE TO %I USING (type = ANY (%L::text[])) WITH CHECK (type = ANY (%L::text[]))',
                   p_schema || '_changes', user_role, p_resource_types, p_resource_types);
    EXECUTE format('GRANT SELECT, INSERT, DELETE ON library.lineage_edge TO %I', user_role);
    EXECUTE format('GRANT SELECT ON gatekeeper.role TO %I', user_role);
    EXECUTE format('GRANT INSERT ON durable.outbox TO %I', user_role);
    EXECUTE format('GRANT SELECT (queue_name, job_id) ON durable.outbox TO %I', user_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION durable.publish_event(text, text, jsonb) TO %I', user_role);

    -- The service: the Library read whole, the outbox relayed and acked.
    EXECUTE format('GRANT SELECT ON library.resource TO %I', service_role);
    EXECUTE format('CREATE POLICY %I ON library.resource FOR SELECT TO %I USING (true)', service_role, service_role);
    EXECUTE format('CREATE POLICY %I ON library.resource_ancestor FOR SELECT TO %I USING (true)', service_role, service_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON durable.outbox TO %I', service_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION durable.ack_outbox(text, text[]) TO %I', service_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION durable.publish_event(text, text, jsonb) TO %I', service_role);
    EXECUTE format('GRANT SELECT ON durable.event_listener TO %I', service_role);
END $$;
