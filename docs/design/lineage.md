# Lineage

**Lineage** is Quarry's equivalent of Foundry's Data Lineage, and **Lineage Explorer** is its app: how resources feed each other, whatever their types. A dataset, a source, an ontology object type and an App Builder app are all nodes in one graph, and lineage covers both directions from any of them.

The backend is built: the table, its policies, `library.lineage` in the kernel, Forge writing edges when recipes are published, the read endpoints, and the Lineage Explorer service. The frontend app isn't.

## 1. Vocabulary

| Term | Meaning |
| --- | --- |
| **Edge** | One row, `Library.Lineage.Edge`: an upstream resource feeds a downstream one on a branch. |
| **Lineage** | The graph those edges form. A resource's lineage is the part reachable from it. |
| **Upstream / downstream** | The direction you walk from a resource. |
| **Declare** | A declarer replacing all of its edges on a branch. |
| **Declarer** | The resource an edge belongs to. It needn't be either end. |

Lineage is not **provenance**. `catalog.transaction.provenance` records what actually wrote one version of a dataset: its job and build. Lineage records what's declared now, and has no history. Both stay.

## 2. The table

`library.lineage_edge` is a self-referencing junction table on `library.resource`:

| Column | |
| --- | --- |
| `upstream_rid` | The resource that feeds. |
| `downstream_rid` | The resource it feeds. |
| `branch` | Recipes are per branch. |
| `declared_by_rid` | The declarer: a declaration replaces only its own edges. |

The primary key is `(upstream_rid, downstream_rid, branch)`, and there's no id or RID: an edge isn't a resource. `declared_by_rid` stays out of the key because one edge has one declarer: a dataset has one producer per branch, and an app declares only its own edges. A second declarer claiming the same edge fails.

It's a separate table from `forge.recipe_input_dataset` and `forge.recipe_output_dataset`. Builds only handle datasets and those rows carry publish checks, so they stay as they are, and dataset edges are stored twice. Asking every service at read time would mean a call per service per hop.

## 3. Declaring

`library.lineage.declare(principal, declaredByRid, branch, edges)` deletes the declarer's edges on the branch and inserts the new set. `LineageService` hangs off the kernel's `LibraryService`, and its repository joins the caller's transaction, so edges commit with what they describe. "Uses" and "produces" are the same call with different edges:

| Producer | When | Edges | Declarer |
| --- | --- | --- | --- |
| Code Workspaces | Publish | Each input → each output | The workspace |
| Data Connection | Publish | Source → dataset | The source |
| Pipeline Builder (later) | Deploy | Each input → each output | The pipeline |
| App Builder (later) | Save | Dataset → app | The app |
| Ontology (later) | Save | Dataset → object type | The ontology |

Everything that publishes recipes goes through Forge, so Forge is the only writer for those producers: `RecipeRepository.publish` writes the edges with `declared_by_rid` set to `recipe.producer_rid`. A recipe isn't a resource, and each publish creates new recipes, so a recipe can't be the declarer. A recipe with no inputs gets producer → output, which is how a sync gets source → dataset. If a second writer also declared for the same producer, each would wipe the other's edges.

A recipe records no mapping from inputs to outputs, so a recipe with 2 inputs and 2 outputs declares 4 edges.

A workspace isn't a node, except for a transform with no inputs, whose workspace is the upstream. An object type's membership in its ontology is containment (`parent_rid`), not lineage.

Passing reads declare nothing: previewing a dataset in a workspace isn't a resource using a resource.

## 4. Reading

`library.lineage.getUpstream` and `getDownstream` take a resource, a branch and optionally a `Library.Lineage.Walk`, and return a `Library.Lineage.Graph`: the edges, and the resources at their ends. By default they go one hop.

- **`depth`:** how many hops to walk. A depth past the end of the graph just stops there, and each edge comes back once, even in a cycle. Over HTTP it's capped at `Walk.MAX_DEPTH`.
- **`includeTrashed`:** by default a trashed resource is left out and stops the walk there. With this on, it's returned and walked through. The starting resource must still be live: a trashed one is a 404 either way.

`library.lineage.getGraph` takes a set of resources and returns a `Graph`: those that are live and visible, and the edges among them. Opening an exploration uses it. `getEdgesBetween` returns only the edges.

A read applies `library.resource`'s policy to both ends of an edge, so a resource the reader can't discover stops the walk even if there's something visible beyond it. Without that, the declarer policy in §5 would show its editors edges to resources they can't see.

Browsers read through the main server, `GET /api/resources/:rid/lineage/upstream` and `/downstream`, with `LibrarySDK.actions.lineage`. Any app can show a resource's lineage this way.

## 5. Permissions

Row-level security, installed by `gatekeeper/001_initial.sql`:

- **Read:** an edge shows if you can `discover` both ends. Hidden neighbours don't appear, so a graph can look like it ends early. The table's policy also lets editors of the declarer see all of its edges, because a redeclaration has to reach edges to resources they've since lost access to; `getUpstream` and `getDownstream` still hide those.
- **Declare:** `write` on the declarer and the downstream resource, and `read` on the upstream one. This can't refuse a publish the recipe policies allow.
- **Replace:** `write` on the declarer.

An edge grants nothing. Each viewer of an app still needs their own `read` on the dataset.

## 6. Enforcement

Reads never check this table. Edges are derived from what actually runs, so the two can't disagree: Forge signs URLs only for a job's pinned inputs and outputs, which come from the same recipe as the edges, and an app's edges come from its saved definition.

**Known gap:** a job's token is the build starter's user token with `via: 'forge-job'`, and only Data Connection's connection endpoint checks `via`. From reading the code, nothing stops transform code from using that token to read a dataset it never declared. It should be closed before markings propagate along lineage.

## 7. Trash and purge

Trash leaves edges alone, so a restore brings the graph back. Trashed resources read as absent, so consumers break at trash time, and that's where a downstream warning belongs.

Purge isn't built. Library will be its entry point (`library.purge`, [jobs.md](jobs.md)): it asks each service holding rows for the resource to clean up, including side effects like deleting a container, then deletes the library row, and `ON DELETE CASCADE` removes the edges. The services can't be just the owner: `forge.recipe_input_dataset`, `forge.recipe_output_dataset`, `forge.recipe.producer_rid` and Data Connection's `output_dataset_rid` all `RESTRICT` the delete, so Library needs an ordered list of services per resource type, ending with the owner.

## 8. Lineage Explorer

Lineage is the Library's. The Lineage Explorer service (`applications/lineage-explorer/microservice`) only owns saved **explorations**, on its own schema and login, reached through the main server's proxy at `/api/lineage-explorer`.

An exploration (`LineageExplorer.Exploration`) is a library resource of type `lineage-exploration`, so folders, sharing and trash come from Library and Gatekeeper. It's also called a graph in Foundry, but `Library.Lineage.Graph` is what a read returns, and `Dataset.View` already takes "view".

| Field | |
| --- | --- |
| `branch` | The branch its edges are read from. |
| `nodes` | `Record<Resource.Rid, { x, y }>`: a resource is on the canvas if it's a key here. |

- **Edges aren't stored.** Opening one reads them with `getGraph`, so it can't go stale. `POST explorations/:rid/open` returns `{ exploration, graph }` in one response and records the audit `open`.
- **Nodes have no foreign keys,** so a purge doesn't touch explorations: a purged resource just stops showing.
- **Hidden nodes stay in `nodes`.** A node the viewer can't see, or a trashed one, is missing from `graph` but still in `exploration.nodes`. A client must send those back when it saves: otherwise someone with less access would delete them for everyone. It means a viewer can see a hidden resource's RID, but nothing else about it.
- **Saving** (`PUT explorations/:rid/nodes`) replaces `nodes`, and the last save wins. It doesn't touch `library.resource.updated_at` yet.
- **Permissions:** the row needs `read` to open and `write` to save. Someone who can only `discover` it sees it in the Library but can't open it.

## 9. Later

- A `kind` column (`derives`, `uses`), with the first `uses` edge. Markings should travel along `derives`.
- The Lineage Explorer app and `LineageExplorerSDK`, then building from the graph and staleness.
