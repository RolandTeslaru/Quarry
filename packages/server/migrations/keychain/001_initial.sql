-- 001_initial — the `keychain` schema.
--
-- Credentials: logins to external systems, encrypted at rest with the workspace
-- key (QUARRY_ENCRYPTION_KEY). Each is a library resource of type 'credential'
-- (project scoped, hidden from the explorer), so names, the tree, trash and
-- Gatekeeper grants come from library.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS keychain;

-- RID type, built on foundations.rid. Other schemas reference credentials through library.resource (rule 3).
CREATE DOMAIN keychain.credential_rid AS foundations.rid CHECK (VALUE LIKE 'ri.keychain.main.credential.%');

CREATE TABLE keychain.credential (
    rid          keychain.credential_rid PRIMARY KEY,
    type         text NOT NULL DEFAULT 'credential' CHECK (type = 'credential'),
    template_id  text NOT NULL CHECK (template_id ~ '^[a-z][a-z0-9-]*$'),   -- 'postgres', … — declared in code (integrations/<System>/credential.ts)
    blob         text NOT NULL,                   -- every value, encrypted together: keyId:iv:authTag:ciphertext — never plain text
    updated_by   identity.user_rid REFERENCES identity.user(rid),          -- who last set the values
    updated_at   timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT
);

-- Row-level security (gatekeeper/001_initial.sql explains the setup). The blob shares the
-- row with the metadata, so a discoverer could SELECT it — revealing and using a credential
-- are gated in KeychainService, and the blob is encrypted either way.
ALTER TABLE keychain.credential ENABLE ROW LEVEL SECURITY;

CREATE POLICY discover ON keychain.credential FOR SELECT TO quarry_user USING (gatekeeper.can(rid, 'discover'));
CREATE POLICY create_  ON keychain.credential FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(rid, 'write'));
CREATE POLICY change   ON keychain.credential FOR UPDATE TO quarry_user
    USING (gatekeeper.can(rid, 'write')) WITH CHECK (gatekeeper.can(rid, 'write'));

GRANT USAGE ON SCHEMA keychain TO quarry_user;
GRANT SELECT, INSERT, UPDATE ON keychain.credential TO quarry_user;
