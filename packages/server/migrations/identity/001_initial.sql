-- 001_initial — the `identity` schema.
--
-- Who is in this workspace. Authentication is GoTrue's, in its own database.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS identity;

-- RID types, built on foundations.rid (which checks the format). A foundation
-- schema, so every service may use these.
CREATE DOMAIN identity.user_rid  AS foundations.rid CHECK (VALUE LIKE 'ri.identity.main.user.%');
CREATE DOMAIN identity.group_rid AS foundations.rid CHECK (VALUE LIKE 'ri.identity.main.group.%');

CREATE TABLE identity.user (
    rid             identity.user_rid PRIMARY KEY,   -- ri.identity.main.user.<GoTrue user id> (no FK: auth is GoTrue's database)
    email           text NOT NULL,
    display_name    text NOT NULL,
    workspace_role  text NOT NULL DEFAULT 'member' CHECK (workspace_role IN ('member', 'admin')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    deactivated_at  timestamptz
);

CREATE UNIQUE INDEX user_email ON identity.user (lower(email));

CREATE TABLE identity.group (
    rid          identity.group_rid PRIMARY KEY,
    name         text NOT NULL,
    description  text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX group_name ON identity.group (lower(name));

CREATE TABLE identity.group_member (
    group_rid identity.group_rid NOT NULL REFERENCES identity.group(rid) ON DELETE CASCADE,
    user_rid  identity.user_rid  NOT NULL REFERENCES identity.user(rid)  ON DELETE CASCADE,
    added_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_rid, user_rid)
);

CREATE INDEX group_member_by_user ON identity.group_member (user_rid);

-- Not resource-scoped: no RLS. Who may manage users and groups is the server's check (workspace admins).
GRANT USAGE ON SCHEMA identity TO quarry_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.user, identity.group, identity.group_member TO quarry_user;
