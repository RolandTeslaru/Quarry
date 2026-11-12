-- 001_initial — the `ontology` schema.
--
-- The Ontology's type layer (docs/design/ontology.md): the ontology, its object types and link types.
-- Object types and link types are library resources ('object-type', 'link-type'), so names, the tree,
-- trash and Gatekeeper grants come from library. The ontology isn't one: it's the scope they sit in.
--
-- Living document until launch: schema changes are edits to this file, not new
-- numbered migrations. Source of truth for the design: docs/design/ontology.md.

CREATE SCHEMA IF NOT EXISTS ontology;

-- RID types, built on foundations.rid. Backing datasets are Catalog's resources, referenced through library.resource.
CREATE DOMAIN ontology.ontology_rid    AS foundations.rid CHECK (VALUE LIKE 'ri.ontology.main.ontology.%');
CREATE DOMAIN ontology.object_type_rid AS foundations.rid CHECK (VALUE LIKE 'ri.ontology.main.object-type.%');
CREATE DOMAIN ontology.link_type_rid   AS foundations.rid CHECK (VALUE LIKE 'ri.ontology.main.link-type.%');

-- One per deployment, seeded here (Ontology.DEFAULT_RID): every type is created in it, nothing creates another yet.
CREATE TABLE ontology.ontology (
    rid           ontology.ontology_rid PRIMARY KEY,
    api_name      text NOT NULL UNIQUE,
    display_name  text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ontology.ontology (rid, api_name, display_name)
VALUES ('ri.ontology.main.ontology.00000000-0000-7000-8000-000000000000', 'default', 'Ontology');

CREATE TABLE ontology.object_type (
    rid                  ontology.object_type_rid PRIMARY KEY,
    type                 text NOT NULL DEFAULT 'object-type' CHECK (type = 'object-type'),
    ontology_rid         ontology.ontology_rid NOT NULL REFERENCES ontology.ontology(rid),
    api_name             text NOT NULL,                  -- PascalCase: 'OffshoreEntity'
    plural_display_name  text NOT NULL,                  -- the singular one is library.resource.name
    ui                   jsonb NOT NULL,                 -- { icon, color }
    backing_dataset_rid  foundations.rid NOT NULL REFERENCES library.resource (rid) ON DELETE RESTRICT
                         CHECK (backing_dataset_rid LIKE 'ri.catalog.main.dataset.%'),
    primary_key          text NOT NULL,                  -- a property's API name
    title_property       text NOT NULL,                  -- a property's API name
    properties           jsonb NOT NULL,                 -- [{ apiName, displayName, description, type, column }], in display order
    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT,
    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX object_type_backing ON ontology.object_type (backing_dataset_rid);     -- the object types a dataset backs

-- The two object types are columns, not inside `sides`: their foreign keys keep an object type with
-- links from being deleted, and "the link types of this object type" is two indexed lookups.
CREATE TABLE ontology.link_type (
    rid                ontology.link_type_rid PRIMARY KEY,
    type               text NOT NULL DEFAULT 'link-type' CHECK (type = 'link-type'),
    ontology_rid       ontology.ontology_rid NOT NULL REFERENCES ontology.ontology(rid),
    a_object_type_rid  ontology.object_type_rid NOT NULL REFERENCES ontology.object_type(rid) ON DELETE RESTRICT,
    b_object_type_rid  ontology.object_type_rid NOT NULL REFERENCES ontology.object_type(rid) ON DELETE RESTRICT,   -- may equal a: a self-link
    sides              jsonb NOT NULL,                   -- { a: { displayName, apiName, cardinality }, b: … }
    backing            jsonb NOT NULL,                   -- Ontology.LinkType.Backing: a foreign key, a join dataset, or an intermediary object type
    FOREIGN KEY (rid, type) REFERENCES library.resource (rid, type) ON DELETE RESTRICT
);

CREATE INDEX link_type_a ON ontology.link_type (a_object_type_rid);
CREATE INDEX link_type_b ON ontology.link_type (b_object_type_rid);

-- ── row-level security (gatekeeper/001_initial.sql explains the setup) ─────
--
-- The ontology is everyone's to read and nobody's to change. A type's definition is its contents
-- (read); its name and place are the library row's (discover).

ALTER TABLE ontology.ontology ENABLE ROW LEVEL SECURITY;
CREATE POLICY read ON ontology.ontology FOR SELECT TO quarry_user USING (true);

ALTER TABLE ontology.object_type ENABLE ROW LEVEL SECURITY;
CREATE POLICY read    ON ontology.object_type FOR SELECT TO quarry_user USING (gatekeeper.can(rid, 'read'));
CREATE POLICY create_ ON ontology.object_type FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(rid, 'write'));
CREATE POLICY replace ON ontology.object_type FOR UPDATE TO quarry_user
    USING (gatekeeper.can(rid, 'write')) WITH CHECK (gatekeeper.can(rid, 'write'));

ALTER TABLE ontology.link_type ENABLE ROW LEVEL SECURITY;
CREATE POLICY read    ON ontology.link_type FOR SELECT TO quarry_user USING (gatekeeper.can(rid, 'read'));
CREATE POLICY create_ ON ontology.link_type FOR INSERT TO quarry_user WITH CHECK (gatekeeper.can(rid, 'write'));
CREATE POLICY replace ON ontology.link_type FOR UPDATE TO quarry_user
    USING (gatekeeper.can(rid, 'write')) WITH CHECK (gatekeeper.can(rid, 'write'));

-- ── the service's roles: ontology_service, ontology_user (foundations.create_service_roles) ──
SELECT foundations.create_service_roles('ontology', ARRAY['object-type', 'link-type']);
