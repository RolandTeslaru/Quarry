-- 001_initial — the `code_workspace` schema.
--
-- Code Workspaces: Git repositories of transforms (docs/design/transforms.md).
-- Each is a library resource of type 'workspace', so names, the tree,
-- trash and Gatekeeper grants come from library. The repository itself is a
-- bare Git repository on disk (QUARRY_GIT_ROOT), named by the workspace's RID.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS code_workspace;

-- RID type, built on foundations.rid. Other schemas reference workspaces through library.resource (rule 3).
CREATE DOMAIN code_workspace.workspace_rid AS foundations.rid CHECK (VALUE LIKE 'ri.code-workspace.main.workspace.%');

CREATE TABLE code_workspace.workspace (
    rid          code_workspace.workspace_rid PRIMARY KEY,
    type         text NOT NULL DEFAULT 'workspace' CHECK (type = 'workspace'),
    template_id  text NOT NULL CHECK (template_id ~ '^[a-z][a-z0-9-]*$'),   -- 'python-transforms', … — declared in code
    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT
);

-- Row-level security (gatekeeper/001_initial.sql explains the setup).
ALTER TABLE code_workspace.workspace ENABLE ROW LEVEL SECURITY;

CREATE POLICY discover ON code_workspace.workspace FOR SELECT TO quarry_user USING (gatekeeper.can(rid, 'discover'));
CREATE POLICY create_  ON code_workspace.workspace FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(rid, 'write'));

GRANT USAGE ON SCHEMA code_workspace TO quarry_user;
GRANT SELECT, INSERT ON code_workspace.workspace TO quarry_user;
