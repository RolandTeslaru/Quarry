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

-- ── durable queues' outbox (docs/design/durable-queues.md) ───────────────
--
-- One for the whole platform. A message is added in the same transaction as the change
-- that calls for it, relayed to Redis (sent_at), and deleted when the work is taken or
-- canceled (the ack). The sweep sends again what's unsent, or sent and not acked in time.

CREATE TABLE foundations.outbox (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    queue_name  text NOT NULL,                  -- the durable queue's name: 'forge.run-job'
    job_id      text NOT NULL,                  -- BullMQ's job id: a second send of it is ignored
    payload     jsonb NOT NULL,                 -- the message, checked against the queue's job schema
    created_at  timestamptz NOT NULL DEFAULT now(),
    sent_at     timestamptz,                    -- last relayed; null = never
    sends       integer NOT NULL DEFAULT 0,     -- how often — one sent many times is missing its ack
    UNIQUE (queue_name, job_id)
);

CREATE INDEX outbox_unsent ON foundations.outbox (queue_name, created_at) WHERE sent_at IS NULL;
CREATE INDEX outbox_sent   ON foundations.outbox (queue_name, sent_at)    WHERE sent_at IS NOT NULL;

-- The ack — callable from user transactions too (a user cancels a build), which may only append otherwise.
CREATE FUNCTION foundations.ack_outbox(p_queue_name text, p_job_ids text[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    DELETE FROM foundations.outbox WHERE queue_name = p_queue_name AND job_id = ANY (p_job_ids)
$$;

-- Users only append (add runs in their transactions) and ack; the relay reads and marks as the system.
GRANT INSERT ON foundations.outbox TO quarry_user;
GRANT SELECT (queue_name, job_id) ON foundations.outbox TO quarry_user;   -- ON CONFLICT's check; never the payloads
GRANT USAGE ON ALL SEQUENCES IN SCHEMA foundations TO quarry_user;
GRANT EXECUTE ON FUNCTION foundations.ack_outbox(text, text[]) TO quarry_user;
