-- 001_initial — the `lineage_explorer` schema.
--
-- Saved explorations (docs/design/lineage.md). Each is a library resource of type
-- 'lineage-exploration', so names, the tree, trash and Gatekeeper grants come from library.
-- Lineage itself is library's.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/database.md.

CREATE SCHEMA IF NOT EXISTS lineage_explorer;

-- RID type, built on foundations.rid.
CREATE DOMAIN lineage_explorer.exploration_rid AS foundations.rid CHECK (VALUE LIKE 'ri.lineage-explorer.main.lineage-exploration.%');

CREATE TABLE lineage_explorer.exploration (
    rid    lineage_explorer.exploration_rid PRIMARY KEY,
    type   text NOT NULL DEFAULT 'lineage-exploration' CHECK (type = 'lineage-exploration'),
    branch text NOT NULL,
    nodes  jsonb NOT NULL DEFAULT '{}',                  -- { <resource rid>: { x, y } }: no foreign keys, a purged resource just stops showing
    legend jsonb NOT NULL DEFAULT '{"type": "resource-type", "isVisible": true}',     -- what the nodes are coloured by, and whether its key shows
    edge_type text NOT NULL DEFAULT 'bezier',            -- how every edge is drawn (Graph.Edge.Type): 'bezier' side to side, 'floating' border to border
    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT
);

-- Its nodes are contents (read), its name and place are the library row's (discover).
ALTER TABLE lineage_explorer.exploration ENABLE ROW LEVEL SECURITY;
CREATE POLICY read    ON lineage_explorer.exploration FOR SELECT TO quarry_user USING (gatekeeper.can(rid, 'read'));
CREATE POLICY create_ ON lineage_explorer.exploration FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(rid, 'write'));
CREATE POLICY save    ON lineage_explorer.exploration FOR UPDATE TO quarry_user
    USING (gatekeeper.can(rid, 'write')) WITH CHECK (gatekeeper.can(rid, 'write'));

-- ── the service's roles: lineage_explorer_service, lineage_explorer_user (foundations.create_service_roles) ──
SELECT foundations.create_service_roles('lineage_explorer', ARRAY['lineage-exploration']);
