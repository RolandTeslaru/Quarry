-- 001_initial — the `durable` schema.
--
-- Durable queues' outbox (docs/design/durable-queues.md). Migrated right after foundations:
-- foundations.create_service_roles grants every service's roles the outbox, so it must exist
-- before the first service's schema calls it.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/durable-queues.md.

CREATE SCHEMA IF NOT EXISTS durable;

GRANT USAGE ON SCHEMA durable TO main_user;

-- ── the outbox ───────────────────────────────────────────────────────────
--
-- One for the whole platform. A message is added in the same transaction as the change
-- that calls for it, relayed to Redis (sent_at), and deleted when the work is taken or
-- canceled (the ack). The sweep sends again what's unsent, or sent and not acked in time.

CREATE TABLE durable.outbox (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    queue_name  text NOT NULL,                  -- the durable queue's name: 'forge.run-job'
    job_id      text NOT NULL,                  -- BullMQ's job id: a second send of it is ignored
    payload     jsonb NOT NULL,                 -- the message, checked against the queue's job schema
    created_at  timestamptz NOT NULL DEFAULT now(),
    sent_at     timestamptz,                    -- last relayed; null = never
    sends       integer NOT NULL DEFAULT 0,     -- how often — one sent many times is missing its ack
    UNIQUE (queue_name, job_id)
);

CREATE INDEX outbox_unsent ON durable.outbox (queue_name, created_at) WHERE sent_at IS NULL;
CREATE INDEX outbox_sent   ON durable.outbox (queue_name, sent_at)    WHERE sent_at IS NOT NULL;

-- The ack — callable from user transactions too (a user cancels a build), which may only append otherwise.
CREATE FUNCTION durable.ack_outbox(p_queue_name text, p_job_ids text[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    DELETE FROM durable.outbox WHERE queue_name = p_queue_name AND job_id = ANY (p_job_ids)
$$;

-- Users only append (add runs in their transactions) and ack; the relay reads and marks as the system.
GRANT INSERT ON durable.outbox TO main_user;
GRANT SELECT (queue_name, job_id) ON durable.outbox TO main_user;   -- ON CONFLICT's check; never the payloads
GRANT USAGE ON ALL SEQUENCES IN SCHEMA durable TO main_user;
GRANT EXECUTE ON FUNCTION durable.ack_outbox(text, text[]) TO main_user;
