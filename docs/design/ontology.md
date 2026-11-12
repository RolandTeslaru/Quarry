# Ontology — the type layer

_Draft, 2026-11-12. Not built. Foundry background: [research notes](../research/palantir-foundry-ontology.md). Lineage: [lineage.md](lineage.md)._

The ontology is Quarry's model of the world on top of datasets, its equivalent of Foundry's Ontology. Pipelines produce clean datasets, and the ontology says what their rows are: an object type per kind of thing, a property per column, and link types between them. Apps then work on objects and links rather than tables.

This spec covers only the **type layer**: the ontology, object types, their properties, and link types. It doesn't cover where objects are stored or how they're indexed, action types, or edits. Each of those gets its own spec (§9).

## 1. Vocabulary

| Term | Meaning |
| --- | --- |
| **Ontology** | The scope every type belongs to. One per deployment. |
| **Object type** | A kind of thing, backed by one dataset: one row is one object. A library resource. |
| **Property** | A field of an object type, mapped from a column of the backing dataset. Part of its object type. |
| **Link type** | A relationship between two object types. A library resource. |
| **Side** | A link type seen from one of its object types: its name, its API name, and whether it leads to one object or many. |
| **Backing** | Where a link type's pairs come from: a foreign key, a join dataset, or an intermediary object type. |
| **API name** | The stable identifier code uses. The display name is for people and can change freely. |
| **Mapping state** | Whether a property's column still exists in the backing dataset with a compatible type. Worked out when the type is read. |

## 2. One ontology per deployment

A deployment has one ontology, seeded by the migration. Links can't cross ontologies, so splitting the model would only add walls, as it does in Foundry, where several ontologies exist to keep organisations apart.

There's still an `ontology.ontology` table, and every type points at it, so a second ontology later means inserting a row rather than migrating data. Until then:

- **The ontology isn't a library resource.** It has no location, no roles and no folder. Types live in projects, and their permissions are their own.
- **There's no API to create one.** Creating a type puts it in the default ontology, and requests don't name one.
- **Links stay within one ontology.** The service checks it on save, so the rule already holds the day a second one exists.

## 3. Tables

All in the `ontology` schema. Object types and link types extend `library.resource` the way `catalog.dataset` does: `(rid, type)` references `library.resource (rid, type)`, so name, description, location (`parent_rid`), trash and roles come from Library and Gatekeeper.

### `ontology.ontology`

| Column | |
| --- | --- |
| `rid` | `ri.ontology.main.ontology.<uuid>`. The seeded row has a fixed RID. |
| `api_name` | `default` for the seeded row. Unique. |
| `display_name` | `Ontology`. |
| `created_at` | |

### `ontology.object_type`

| Column | |
| --- | --- |
| `rid` | `ri.ontology.main.object-type.<uuid>` |
| `type` | `'object-type'`, for the foreign key to `library.resource`. |
| `ontology_rid` | References `ontology.ontology`. |
| `api_name` | PascalCase, singular: `OffshoreEntity`. `UNIQUE (ontology_rid, api_name)`. |
| `plural_display_name` | `Offshore Entities`. The singular display name is the resource's `name`. |
| `ui` | jsonb `{ icon, color }`: an icon name from standard-ui and a palette token, never a hex value. |
| `backing_dataset_rid` | The one dataset whose rows are the objects. |
| `primary_key` | The API name of the property that identifies an object. |
| `title_property` | The API name of the property shown as an object's title. |
| `properties` | jsonb, an ordered array of properties (§4). |

### `ontology.link_type`

| Column | |
| --- | --- |
| `rid` | `ri.ontology.main.link-type.<uuid>` |
| `type` | `'link-type'` |
| `ontology_rid` | References `ontology.ontology`. |
| `a_object_type_rid` | References `ontology.object_type`. |
| `b_object_type_rid` | References `ontology.object_type`. Can equal `a_object_type_rid`: a self-link. |
| `sides` | jsonb `{ a: Side, b: Side }` (§5). |
| `backing` | jsonb, one of three kinds (§5). |

The two object types are real columns, not inside `sides`, for two reasons. The foreign keys stop an object type's row from being deleted while links use it. And "the link types of this object type" is a query on two indexed columns.

`library.resource_type` gets `('object-type', false, true)` and `('link-type', false, true)`.

## 4. Object types and properties

```ts
export namespace ObjectType {
    export const Rid     = Foundations.Rid.generateSchema("ontology", "object-type")
    export const ApiName = z.string().regex(/^[A-Z][A-Za-z0-9]*$/)

    export const Schema = Resource.Base.extend({
        rid:               Rid,
        parentRid:         Resource.Rid,
        ontologyRid:       Ontology.Rid,
        apiName:           ApiName,
        pluralDisplayName: z.string().min(1),
        ui:                Ui.Schema,
        backingDatasetRid: Dataset.Rid,
        primaryKey:        Property.ApiName,
        titleProperty:     Property.ApiName,
        properties:        z.record(Property.ApiName, Property.Schema),
    })
}

export namespace Property {
    export const ApiName = z.string().regex(/^[a-z][A-Za-z0-9]*$/)
    export const Type    = z.enum(["string", "integer", "long", "double", "decimal", "boolean", "date", "timestamp"])

    export const Schema = z.object({
        displayName: z.string().min(1),
        description: z.string().nullable(),
        type:        Type,
        column:      z.string(),
    })
}
```

- **`properties` is a Record in the domain and an array in the database.** jsonb doesn't keep key order, and properties have a display order, so the column stores `[{ apiName, … }]` and the repository turns it into a Record. JS keeps string keys in insertion order, so the order survives.
- **The primary key and title point at properties, not columns.** The column mapping lives in one place, and code, links and the API all speak in property names.
- **A property's type is an ontology type, not the column's.** In this first version they must match: a `long` property needs a `long` column. Catalog's `binary` has no property type. Lists, structs and geopoints wait for Catalog's nested types.
- **The primary key's type** must be `string`, `integer` or `long`.
- **API names:** unique within the ontology for object types, within the object type for properties. A few property names are reserved because the API uses them: `rid`, `primaryKey`, `ontology`, `objectType`, `title`.
- **Status, visibility and edits aren't here.** Foundry's object types also carry a status (experimental, active, deprecated), a visibility (prominent, normal, hidden) and an edits setting. The first two aren't wanted, and edits come with their own spec as a new column.

## 5. Link types

```ts
export namespace LinkType {
    export const Rid     = Foundations.Rid.generateSchema("ontology", "link-type")
    export const ApiName = z.string().regex(/^[a-z][A-Za-z0-9]*$/)

    export namespace Side {
        export const Schema = z.object({
            objectTypeRid: ObjectType.Rid,
            displayName:   z.string().min(1),
            apiName:       ApiName,
            cardinality:   z.enum(["one", "many"]),
        })
    }

    export namespace Backing {
        export const Schema = z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("foreign-key"), foreignKey: z.object({ side: z.enum(["a", "b"]), property: Property.ApiName }) }),
            z.object({ kind: z.literal("dataset"), datasetRid: Dataset.Rid, columns: z.object({ a: z.string(), b: z.string() }) }),
            z.object({ kind: z.literal("object"), objectTypeRid: ObjectType.Rid, properties: z.object({ a: Property.ApiName, b: Property.ApiName }) }),
        ])
    }

    export const Schema = Resource.Base.extend({
        rid:         Rid,
        parentRid:   Resource.Rid,
        ontologyRid: Ontology.Rid,
        sides:       z.object({ a: Side.Schema, b: Side.Schema }),
        backing:     Backing.Schema,
    })
}
```

### Sides

A link type is read in both directions, so it has two names. A side describes the link from its object type: from an operative, `operative.loadout` leads to many equipment; from an equipment, `equipment.equippedBy` leads to many operatives. `cardinality` is what you get going from that side.

The sides are `a` and `b`, not keyed by object type, because a self-link has the same object type on both: an officer's relatives are officers.

A side's API name must be unique among its object type's link sides and must not equal one of its property API names: `officer.entities` can mean only one thing. These span rows, so the service checks them on save.

### Backings

A link always points at the other side's primary key. A backing names only what varies:

| Kind | Names | Points at | Cardinality |
| --- | --- | --- | --- |
| `foreign-key` | One property, on one side | The other side's primary key | The foreign-key side is `one`. The other is `many`, or `one` for one-to-one. |
| `dataset` | A join dataset, and a column in it per side | Each side's primary key | Both `many`. |
| `object` | An intermediary object type, and a property of it per side | Each side's primary key | Both `many`. |

- **Foreign key:** the referenced property isn't stored, because it can only be the primary key. Storing it would add a value that could disagree. Foundry's wizard fixes that side too: you pick the foreign-key property on one side and swap sides with a button.
- **Join dataset:** a many-to-many with nothing on the link but the pair, like ICIJ's `relationships`.
- **Intermediary object type:** how a link gets properties of its own. A PEP's position has a role and dates, so `Position` is an object type with a property for the person and one for the office, and the link goes through it.

### Resource name

`library.resource.name` needs a name for the folder view, and Foundry's wizard doesn't ask for one. It defaults to the two object types' display names, `Operative ↔ Equipment`, and can be renamed like any resource.

## 6. Validation and mapping state

### On save

Creating or replacing a type checks it against its backing dataset's current schema on main:

- **Object type:**
  - The backing dataset has a tabular schema: not raw JSON files, not empty.
  - Every property's column exists, and its type matches the property's.
  - `primaryKey` and `titleProperty` name existing properties, and the primary key has an allowed type.
  - The API names follow §4 and are unique.
- **Link type:**
  - Both object types are in the link type's ontology.
  - The cardinalities fit the backing kind.
  - Foreign key: the property exists on its side and has the same type as the other side's primary key.
  - Join dataset: both columns exist, each with its side's primary-key type.
  - Intermediary object type: both properties exist, each with its side's primary-key type.
  - The sides' API names pass the checks in §5.

A failed check is a 400 that names the property or side.

A save doesn't check the data: whether the primary key is unique and non-null in practice is the indexer's business.

### On read

A dataset's schema can change after a type is saved. A column is dropped or retyped, and a mapping that was valid isn't any more. Nothing stores that: reading a type compares it with the latest schema, the way staleness is computed, and returns a state alongside it.

| State | Meaning |
| --- | --- |
| `ok` | The column exists with a matching type. |
| `missing-column` | The column isn't in the dataset's schema. |
| `incompatible-type` | The column's type no longer matches the property's. |

Object types get one state per property. Link types get a state for their backing columns or properties. A backing dataset that can't be read (trashed, no access, or no tabular schema) makes every mapping that depends on it `missing-column`. Whether that deserves its own state can wait until someone sees it in a UI.

## 7. Permissions, trash and lineage

### Permissions

Types are resources, so their roles come from Gatekeeper like any resource's:

| Action | Needs |
| --- | --- |
| See a type | `read` on it. That shows the definition, not the objects: object permissions come with storage. |
| Create an object type | `write` on the parent folder, `read` on the backing dataset. |
| Replace an object type | `write` on it, `read` on its backing dataset, and on the new one if it changes. |
| Create or replace a link type | `write` on its parent folder or itself, and `read` on both object types and on its join dataset or intermediary object type. |

A link type adds a side name to both object types (`operative.loadout`), so with only `read` someone can add names to a type they can't edit. Foundry's older model required edit rights on both object types. This spec starts with `read`, as an open question (§10).

### Trash

Trash follows lineage.md §7: trashing never blocks, and things that depend on the trashed resource break at trash time.

- A trashed backing dataset makes its object type's mappings `missing-column`.
- A trashed object type makes the link types using it unreadable for the API, the same way a trashed resource reads as absent.

Purge isn't built. The foreign keys from `ontology.object_type` and `ontology.link_type` `RESTRICT` deletes, so when Library's purge comes, Ontology is one more service in its ordered list.

### Lineage

Types declare lineage on save, with `library.lineage.declare` on main, in the same transaction:

| Declarer | Edges |
| --- | --- |
| Object type | Backing dataset → object type |
| Link type | Each of its object types → link type, and its join dataset or intermediary object type → link type |

The declarer is the type itself, not the ontology: the ontology isn't a resource. lineage.md §3 still lists "the ontology" as the declarer and needs updating.

## 8. Service and API

An Ontology microservice, `applications/ontology/microservice`, owns the `ontology` schema, the way Catalog owns `catalog`. It asks Catalog for dataset schemas, and Library for resources and lineage, through calls. It doesn't read their tables.

Browsers go through the main server's proxy at `/api/ontology`:

| Route | |
| --- | --- |
| `POST object-types` | Create, in the default ontology. Body: `parentRid`, `name`, `description`, and the fields of §4. |
| `GET object-types/:rid` | The object type and its mapping states. |
| `PUT object-types/:rid` | Replace its definition. Name, description and location go through Library, like any resource. |
| `GET object-types/:rid/link-types` | Its link types, from either side. |
| `POST link-types` | Create. |
| `GET link-types/:rid` | The link type and its mapping states. |
| `PUT link-types/:rid` | Replace its sides and backing. |

There's no list of every type in the ontology yet, because the Ontology Manager isn't in scope. The Library lists types by folder like any resource.

## 9. Later

- **Object storage and indexing:** where objects live, what triggers a reindex, what a duplicate primary key does, and how index status is inferred from the dataset version an index was built from.
- **Edits:** an `edits` column on the object type (enabled, conflict strategy), and a store of edits applied over the backing data.
- **Action types:** parameters, rules, submission criteria. They're part of the type layer but depend on edits.
- **Ontology Manager:** the app for creating and browsing types, with the link type wizard.
- **Property types:** lists (FtM data is full of them), structs, geopoints, once Catalog has nested types. Compatible widenings, like an `integer` column backing a `long` property.
- **Several datasets per object type,** for column-level permissions. A property already names its column, so a dataset per property can be added later.
- **Shared properties and interfaces.**

## 10. Open questions

- **Rights to link someone else's object type:** `read` (this spec) or `write` on both object types.
- **Branches:** types are validated and declare lineage on main only. Datasets have branches, and Foundry's ontology has its own branching. Nothing here needs it yet.
- **Changing API names:** allowed for now. Once code depends on them, a rename breaks it. Foundry locks them once a type is `active`, a status this spec leaves out.
