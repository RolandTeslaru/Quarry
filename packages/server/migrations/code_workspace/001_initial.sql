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
CREATE DOMAIN code_workspace.check_run_rid AS foundations.rid CHECK (VALUE LIKE 'ri.code-workspace.main.check-run.%');

CREATE TABLE code_workspace.workspace (
    rid          code_workspace.workspace_rid PRIMARY KEY,
    type         text NOT NULL DEFAULT 'workspace' CHECK (type = 'workspace'),
    template_id  text NOT NULL CHECK (template_id ~ '^[a-z][a-z0-9-]*$'),   -- 'python-transforms', … — declared in code
    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT
);

-- CI for one pushed branch head (docs/design/code-workspaces/checks.md). Also its own outbox:
-- `queued` = decided, maybe not yet sent to the worker; the sweep re-sends it.
CREATE TABLE code_workspace.check_run (
    rid            code_workspace.check_run_rid PRIMARY KEY,
    workspace_rid  code_workspace.workspace_rid NOT NULL REFERENCES code_workspace.workspace(rid) ON DELETE CASCADE,
    branch         text NOT NULL,
    commit         text NOT NULL CHECK (commit ~ '^[0-9a-f]{40}$'),
    status         text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
    steps          jsonb NOT NULL DEFAULT '[]',     -- CodeWorkspace.CheckRun.Step[]: the server's, then quarry-ci.yml's
    published      boolean NOT NULL DEFAULT false,  -- its commit became the branch's job specs
    failure        jsonb,                           -- { step, message }
    pushed_by      identity.user_rid REFERENCES identity.user(rid),   -- whom it acts as; null = the system
    created_at     timestamptz NOT NULL DEFAULT now(),
    started_at     timestamptz,                     -- claimed by dispatch, sent to the worker
    reported_at    timestamptz,                     -- the worker's last report; null until it takes the run
    finished_at    timestamptz,
    CHECK ((status IN ('succeeded', 'failed', 'canceled')) = (finished_at IS NOT NULL)),
    CHECK (status NOT IN ('running', 'succeeded', 'failed') OR started_at IS NOT NULL),
    CHECK (NOT published OR status = 'succeeded'),
    CHECK ((status = 'failed') = (failure IS NOT NULL))
);

CREATE INDEX check_run_branch ON code_workspace.check_run (workspace_rid, branch, created_at DESC);   -- the Checks tab, superseding
CREATE INDEX check_run_queued ON code_workspace.check_run (created_at) WHERE status = 'queued';      -- what dispatch sends next
CREATE UNIQUE INDEX check_run_one_running ON code_workspace.check_run (workspace_rid) WHERE status = 'running';   -- one at a time per workspace

-- Row-level security (gatekeeper/001_initial.sql explains the setup).
ALTER TABLE code_workspace.workspace ENABLE ROW LEVEL SECURITY;

CREATE POLICY discover ON code_workspace.workspace FOR SELECT TO quarry_user USING (gatekeeper.can(rid, 'discover'));
CREATE POLICY create_  ON code_workspace.workspace FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(rid, 'write'));

-- Check runs are the workspace's: seen with read on it; created (a push) and superseded with write.
-- The worker's reports update them as the service.
ALTER TABLE code_workspace.check_run ENABLE ROW LEVEL SECURITY;

CREATE POLICY read    ON code_workspace.check_run FOR SELECT TO quarry_user USING (gatekeeper.can(workspace_rid, 'read'));
CREATE POLICY create_ ON code_workspace.check_run FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(workspace_rid, 'write'));
CREATE POLICY change  ON code_workspace.check_run FOR UPDATE TO quarry_user
    USING (gatekeeper.can(workspace_rid, 'write')) WITH CHECK (gatekeeper.can(workspace_rid, 'write'));

GRANT USAGE ON SCHEMA code_workspace TO quarry_user;
GRANT SELECT, INSERT ON code_workspace.workspace TO quarry_user;
GRANT SELECT, INSERT, UPDATE ON code_workspace.check_run TO quarry_user;
