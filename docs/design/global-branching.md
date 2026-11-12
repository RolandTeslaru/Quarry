# Global branching

_Notes, 2026-11-13. **Deferred:** not planned and not built. A record of the design discussed while specifying the ontology, so it can be picked up later. Until then, branching stays where it is today (§2), and the ontology and its index are main-only ([ontology.md](ontology.md), [ontology-indexer.md](ontology-indexer.md))._

A **global branch** is one named branch that spans every product. `dev` means the same thing to a code workspace, its recipes, its builds, the datasets they write, ontology definitions and object indexes. You work on a branch across products and merge it back as one change.

## 1. Foundry

Foundry calls it **Global Branching**. It was a beta from January 2025 (as "Foundry Branching", off by default) and generally available from May 2026, covering transforms repositories, TypeScript v1 functions, Pipeline Builder, the Ontology, Workshop, AIP Logic and Object Views. Some pieces were still beta at launch, such as Restricted Views and Automate. Approval integration and removing a resource from a branch came later.

- **One branch, many resources.** Every app has the same branch picker. A branch lists the resources modified on it, across apps, for one review and one merge.
- **Datasets follow by name,** with fallback to the parent branch where nothing was built on the branch.
- **Ontology changes live on the branch.** Once a branch has ontology changes, it must be rebased by hand to pick up main's.
- **Objects are indexed on a branch only on request,** from the object type page or in bulk from Workflow Lineage, optionally bringing main's edits. Actions on a branch apply only to types indexed on it, and indexing counts as a change that may need approval to merge.
- **Protection is per resource,** through project policies: merging changes to a protected resource needs approval.

Before 2025, each product branched on its own: git in code repositories, dataset branches in builds, proposals in the ontology, versions in Workshop. Global Branching looks like a coordination layer over those, not a rewrite: a branch name plus its modified resources, mapped onto each product's own mechanism, with each product merging its part. Object Storage V2, which keeps separate indexes per object type, is probably what made branch indexes possible. This is inferred from the docs and the launch's shape, not from Palantir's internals.

Sources: [Global Branching overview](https://www.palantir.com/docs/foundry/global-branching/overview), [Branching the ontology](https://www.palantir.com/docs/foundry/ontologies/branching-ontology), [Branching action types](https://www.palantir.com/docs/foundry/action-types/branching-action-types), [Workflow Lineage branching](https://www.palantir.com/docs/foundry/workflow-lineage/branching-workflow-lineage), [Resource protection](https://palantir.com/docs/foundry/foundry-branching/protecting-resources), announcements of [January 2025](https://www.palantir.com/docs/foundry/announcements/2025-01) and [May 2026](https://www.palantir.com/docs/foundry/announcements/2026-05).

## 2. What Quarry branches today

A branch is a name, `Foundations.Branch`: a branded string with git's naming rules, matched by name everywhere. There's no table behind it.

| Branched | How |
| --- | --- |
| Datasets | `catalog.branch` per dataset, transactions per branch |
| Code | Git branches in code workspaces; `code_workspace.check_run.branch` is the pushed branch |
| Recipes | Checks publish a workspace's recipes on the git branch they ran for: `forge.recipe.branch`, `forge.current_recipe.branch`. Data Connection syncs publish on main. |
| Builds | `forge.build.branch`, chosen by whoever starts the build, with fallback branches |
| Lineage | `library.lineage_edge.branch`, part of the primary key: on a branch, a transform can read and write different datasets, so each branch has its own graph |
| Explorations | `lineage_explorer.exploration.branch`, the branch its edges are read from |

Because names match, git and everything downstream already stay in step: pushing `dev` to a workspace gives recipes, builds and dataset branches on `dev`. Two workspaces that both have `dev` feed the same `dev`, which is intended.

**Global on purpose,** as in Foundry: the Library (resources, names, folders, trash), Gatekeeper's roles and grants, Identity, Keychain, and Data Connection's sources and syncs.

**Not branched:** the ontology and its index.

## 3. The branch registry

A table makes the shared name a real record, and every branched column references it:

```sql
foundations.branch (
    name        text PRIMARY KEY,                           -- Foundations.Branch's rules
    parent      text REFERENCES foundations.branch(name),   -- null for main
    created_by  identity.user_rid,
    created_at  timestamptz NOT NULL DEFAULT now()
)
```

`catalog.branch.name`, `forge.recipe.branch`, `forge.current_recipe.branch`, `forge.build.branch`, `code_workspace.check_run.branch`, `library.lineage_edge.branch` and `lineage_explorer.exploration.branch` all get a foreign key to it. The index database can't reference it, so its service checks branch names instead.

**A kernel `BranchService`** is the one entry point:

| Method | Used by | Does |
| --- | --- | --- |
| `ensure(principal, name, parent = main)` | A push (`servePush`), Forge publishing on a branch, Catalog opening a transaction on a new dataset branch | Registers the branch on first use. Called after the caller's own permission check passed. |
| `create(principal, name, parent)` | An explicit "new branch" action | Registers a new branch, refusing names that exist |
| `get`, `getMany`, `list` | Branch pickers, builds | Reads |

- **Branches register on first use,** so pushing a new git branch keeps working as it does today. A branch created locally in the IDE exists once it's pushed.
- **Git doesn't record a branch's parent,** so a pushed branch gets `main` by default.
- **Deleting a git branch doesn't delete the global branch:** other workspaces, datasets or the ontology may still use it. Deleting a global branch is an ordered cleanup across services, like purge.
- **The foreign keys are a backstop:** a service that forgets `ensure` fails its insert rather than creating an unregistered branch.

## 4. Permissions

A branch isn't a library resource: it has no location, no owner and no roles, and it cuts across projects. What's checked is the resource changed on a branch: you can change a resource on a branch if you could change it at all.

- **Code workspaces:** pushing any branch needs `write` on the workspace, which `servePush` already checks. Registering the branch is a side effect of an allowed push.
- **Datasets:** a transaction on `dev` needs `write` on the dataset, as on main.
- **Ontology:** saving a type on `dev` needs `write` on the type.

What branches need later is **protection**, not permissions: main can't be written directly for some resources, and changes arrive by merge with approval. Like Foundry's, that's per resource.

## 5. Versioning resources that can't append

Datasets branch cheaply because their content can be appended to: a branch adds transactions, and the version is computed from what came before on the parent. A definition, such as an object type, is one whole document, with nothing to append to.

The answer is git's: it stores a full snapshot per commit, not diffs, and computes diffs by comparing snapshots. Version control needs **immutable versions and a movable pointer per branch**, which Quarry already has twice:

| | Immutable versions | Pointer per branch |
| --- | --- | --- |
| Catalog | `catalog.transaction` | `catalog.branch.last_sequence` |
| Forge | `forge.recipe` (a new version is a new recipe) | `forge.current_recipe (dataset, branch) → recipe` |

### Versions and heads

For resources that are whole definitions (object types, link types, later apps), rather than a pair of tables per type:

- **Each service's table is keyed by `(rid, version)`.** Rows never change. `version` counts up per RID across all branches, and `created_on_branch` records where a version was made. The branch isn't in the key: versions are shared by every branch that points at them.
- **One shared head table,** `library.resource_head (rid, branch) → version, base_version`. It sits next to `library.resource` because it's per resource, and Library already lets each service write only rows of its own resource types. `base_version` is the version the branch started from.

Datasets and code workspaces don't use it: transactions and git already version them.

| Operation | Does |
| --- | --- |
| **Save on a branch** | Insert `(rid, version + 1)` and move the branch's head, in one transaction. History comes for free. |
| **Create a branch** | Copy the parent's heads for every versioned type, in one statement in `BranchService`. Both branches point at the same versions until one saves. |
| **Create a resource on a branch** | Version 1, and a head on that branch with no base. |
| **Merge a branch into main** | Per resource, three-way, like git: |
| | only the branch changed it (main's head equals the branch's base) → main moves to the branch's version |
| | only main changed it → nothing |
| | both changed it → conflict |
| | deleted on the branch (no head, but a base) → main's head is removed |

"Commit" isn't "production": a save on `dev` is a version only `dev` points at. Production is whatever main's heads point at.

### References

| Kind | Stored as | Resolved by | Example |
| --- | --- | --- | --- |
| **Live:** this resource, whatever it currently is | The RID, with a foreign key to `library.resource(rid)` | The head on the branch being read | A link type's object types: on `dev`, they're dev's |
| **Pinned:** exactly this version | `(rid, version)`, with a real foreign key, since versions never change | Nothing | An index records the definition version it was built from |

The cost: the database can't guarantee that a link type on `dev` points at an object type that exists on `dev`. The service checks it on save, when a merge would remove an object type links still use (a conflict), and on read, where such a link shows as broken.

## 6. The ontology and its index on branches

- **Definitions:** an ontology branch is the global branch. Creating it copies main's heads, and saving a type on it creates a version only it points at.
- **Indexes are opt-in per branch, with no fallback.** You index a type on a branch by hand, and it's built from the backing dataset on the same branch name. The pointer is keyed `(resource_rid, branch)`, and tables can sit in a schema per branch, with a `branch → schema` mapping because git branch names aren't valid Postgres names. Once a type is indexed on a branch, commits to its backing dataset on that branch reindex it.
- **Join-dataset link types** get their own table per branch like object types. Foreign-key and object-backed links follow the object type tables on that branch. Indexing a type on a branch should bring its join-dataset links along, as Foundry's bulk indexing offers.
- **Open:** whether indexing on a branch fails when the backing dataset was never built there, or reads main's version as Forge builds do.

## 7. Migrating to it

None of this blocks work done main-only now:

- **The registry:** create `foundations.branch`, seed every branch name already in use, then add the foreign keys.
- **Ontology definitions:** today's row becomes version 1, and main's head points at it.
- **The index pointer:** gains a `branch` column, `main` for existing rows.
