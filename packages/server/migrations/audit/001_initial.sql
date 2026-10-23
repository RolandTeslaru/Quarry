-- 001_initial — the `audit` schema.
--
-- Access events, append-only: who accessed what, how and when. Writes (`modify`)
-- are recorded by triggers on the tables users write, installed here — Audit is
-- their consumer, as Gatekeeper is of its epoch triggers. Reads, reveals, denials
-- and opens are recorded by the server (AuditService). Migrated last: the
-- triggers attach to every other service's tables.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/audit.md.

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE audit.access_event (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at              timestamptz NOT NULL DEFAULT now(),
    user_rid        text        NOT NULL,          -- whose access; a delegate's user
    via             text,                          -- what acted for them (`sync:<id>`); NULL = the user directly
    resource_rid    text        NOT NULL,          -- no FK: the record outlives the resource
    resource_type   text        NOT NULL,          -- the RID's type segment, kept: the resource may be gone
    action          text        NOT NULL CHECK (action IN ('open', 'read', 'download', 'modify', 'reveal', 'denied')),
    application_id  text,                          -- Platform.Application.Id, validated by the server; only for open
    detail          jsonb       NOT NULL DEFAULT '{}',
    CHECK ((action = 'open') = (application_id IS NOT NULL))
);

-- Who accessed this resource; what did this user do.
CREATE INDEX access_event_resource ON audit.access_event (resource_rid, at DESC);
CREATE INDEX access_event_user     ON audit.access_event (user_rid, at DESC);

-- Recents: this user's opens in this app, newest first.
CREATE INDEX access_event_recent   ON audit.access_event (user_rid, application_id, at DESC) WHERE action = 'open';

-- ── row-level security ──────────────────────────────────────────────────
--
-- Users record only as themselves, read only their own opens (recents), and never
-- change or delete an event. Admin reads and the triggers run as the owner.

ALTER TABLE audit.access_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY record_own ON audit.access_event FOR INSERT TO quarry_user
    WITH CHECK (user_rid = current_setting('app.user_rid', true));

CREATE POLICY read_own_opens ON audit.access_event FOR SELECT TO quarry_user
    USING (user_rid = current_setting('app.user_rid', true) AND action = 'open');

GRANT USAGE ON SCHEMA audit TO quarry_user;
GRANT SELECT, INSERT ON audit.access_event TO quarry_user;

-- ── writes: triggers ────────────────────────────────────────────────────
--
-- One `modify` event per change, in the write's own transaction. The actor and
-- `via` are the transaction's (asUser sets them, pool.ts); a service transaction
-- has no user — the system acting on its own — and records nothing.
-- SECURITY DEFINER: inserts as the owner, past RLS, whoever wrote the row.

CREATE FUNCTION audit.record_change(p_resource text, p_detail jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    actor text := nullif(current_setting('app.user_rid', true), '');
BEGIN
    IF actor IS NULL OR p_resource IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO audit.access_event (user_rid, via, resource_rid, resource_type, action, detail)
    VALUES (actor,
            nullif(current_setting('app.via', true), ''),
            p_resource,
            split_part(p_resource, '.', 4),            -- ri.<service>.<instance>.<type>.<id>: library keeps it = the type
            'modify',
            p_detail);
END $$;

-- library.resource: create, rename, move, trash, restore.
CREATE FUNCTION audit.on_resource() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM audit.record_change(NEW.rid, jsonb_build_object('op', 'create', 'name', NEW.name, 'parentRid', NEW.parent_rid));
        RETURN NULL;
    END IF;

    IF NEW.name IS DISTINCT FROM OLD.name THEN
        PERFORM audit.record_change(NEW.rid, jsonb_build_object('op', 'rename', 'from', OLD.name, 'to', NEW.name));
    END IF;

    IF NEW.parent_rid IS DISTINCT FROM OLD.parent_rid THEN
        PERFORM audit.record_change(NEW.rid, jsonb_build_object('op', 'move', 'from', OLD.parent_rid, 'to', NEW.parent_rid));
    END IF;

    IF OLD.trashed_at IS NULL AND NEW.trashed_at IS NOT NULL THEN
        PERFORM audit.record_change(NEW.rid, jsonb_build_object('op', 'trash'));
    ELSIF OLD.trashed_at IS NOT NULL AND NEW.trashed_at IS NULL THEN
        PERFORM audit.record_change(NEW.rid, jsonb_build_object('op', 'restore'));
    END IF;

    RETURN NULL;
END $$;

CREATE TRIGGER audit_resource
    AFTER INSERT OR UPDATE OF name, parent_rid, trashed_at ON library.resource
    FOR EACH ROW EXECUTE FUNCTION audit.on_resource();

-- gatekeeper.role_grant: grant, change, revoke.
CREATE FUNCTION audit.on_grant() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    grant_row gatekeeper.role_grant := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
    PERFORM audit.record_change(grant_row.resource_rid, jsonb_build_object(
        'op',       CASE TG_OP WHEN 'INSERT' THEN 'grant' WHEN 'UPDATE' THEN 'change' ELSE 'revoke' END,
        'userRid',  grant_row.user_rid,
        'groupRid', grant_row.group_rid,
        'role',     grant_row.role,
        'from',     CASE WHEN TG_OP = 'UPDATE' THEN OLD.role END));
    RETURN NULL;
END $$;

CREATE TRIGGER audit_grant
    AFTER INSERT OR UPDATE OR DELETE ON gatekeeper.role_grant
    FOR EACH ROW EXECUTE FUNCTION audit.on_grant();

-- keychain.credential: values replaced — never the values themselves.
CREATE FUNCTION audit.on_credential() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NEW.blob IS DISTINCT FROM OLD.blob THEN
        PERFORM audit.record_change(NEW.rid, jsonb_build_object('op', 'values'));
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER audit_credential
    AFTER UPDATE OF blob ON keychain.credential
    FOR EACH ROW EXECUTE FUNCTION audit.on_credential();

-- data_connection.source: config or credential changed.
CREATE FUNCTION audit.on_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NEW.config IS DISTINCT FROM OLD.config OR NEW.credential_rid IS DISTINCT FROM OLD.credential_rid THEN
        PERFORM audit.record_change(NEW.rid, jsonb_build_object(
            'op',            'config',
            'credentialRid', NEW.credential_rid));
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER audit_source
    AFTER UPDATE OF config, credential_rid ON data_connection.source
    FOR EACH ROW EXECUTE FUNCTION audit.on_source();

-- data_connection.sync: created, changed, deleted — recorded on its source (a sync isn't a library resource).
CREATE FUNCTION audit.on_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    sync_row data_connection.sync := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
    PERFORM audit.record_change(sync_row.source_rid, jsonb_build_object(
        'op',      CASE TG_OP WHEN 'INSERT' THEN 'sync.create' WHEN 'UPDATE' THEN 'sync.change' ELSE 'sync.delete' END,
        'syncRid', sync_row.rid,
        'name',    sync_row.name));
    RETURN NULL;
END $$;

CREATE TRIGGER audit_sync
    AFTER INSERT OR UPDATE OR DELETE ON data_connection.sync
    FOR EACH ROW EXECUTE FUNCTION audit.on_sync();

-- catalog.transaction: committed — recorded on its dataset (a sync run's commit as its delegate, via sync:<id>).
CREATE FUNCTION audit.on_commit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    PERFORM audit.record_change(NEW.dataset_rid, jsonb_build_object(
        'op',             'commit',
        'transactionRid', NEW.rid,
        'type',           NEW.type,
        'sequence',       NEW.sequence));
    RETURN NULL;
END $$;

CREATE TRIGGER audit_commit
    AFTER UPDATE OF status ON catalog.transaction
    FOR EACH ROW WHEN (OLD.status <> 'committed' AND NEW.status = 'committed')
    EXECUTE FUNCTION audit.on_commit();
