# Audit — Access Events

_Draft, 2026-10-23. Principals and `via` are in [gatekeeper.md](gatekeeper.md#3-principals); schema rules in [database.md](database.md); application ids in `@quarry/shared` (`Platform.Application.Id`). Answers the audit-log open question in [gatekeeper.md §10](gatekeeper.md#10-open-questions) and the reveal audit in [keychain.md](keychain.md)._

Audit records **who accessed what, how, and when** — one append-only event per meaningful access. It serves two readers:

- **Admins**: who read this dataset, who revealed this credential, who was refused.
- **Users**: each app's home screen lists *your recently opened* resources in that app — read from your own `open` events.

Recents are not a table of their own: they are a query over the events (§5).

---

## 1. Model

| Concept | What it is |
|---|---|
| **Access event** | One access by one principal to one resource: `at`, who, what, the action, and — for `open` — the app. Never updated or deleted by the application. |
| **Actor** | `user_rid` — whose access it was. A delegate's user, never the job. |
| **`via`** | *What* acted for the user when it wasn't them directly: `sync:<id>` (a scheduled or triggered run), `probe` (a connection test or explore the worker ran). `NULL` — the user did it themselves. From `Principal.Delegate.via`; record-keeping only, never an access-control input. |
| **Application** | `Platform.Application.Id` — the app a resource was opened in. Only on `open`. |

Not recorded:

- **Service principals** (`Principal.SELF`) — the system's own housekeeping: outbox relay, storage GC, reaper. No user, no access.
- **Discover** — listings (`children`, Keychain's credential list, Data Connection's home). A folder listing checks every child; recording each would bury the events that matter. Opening one of them is recorded.

---

## 2. Actions

`text` + `CHECK`, per the [conventions](database.md#conventions).

| Action | Recorded when | By (§4) |
|---|---|---|
| `open` | An app opens a resource's page (`/datasets/$rid`, `/data-connection/sources/$rid`, `/library/$rid` …) | The frontend: the route's `onEnter` → `POST /api/audit/open` |
| `read` | Data is read: a dataset's view or preview; a source tested or explored; a credential used by a run or probe | `@Audit('read')` on the service method |
| `download` | A file or export leaves the platform | `@Audit('download')` (no such method yet) |
| `modify` | A write: create, upload / commit, config or values change, rename, move, trash, restore, share (grant / revoke) | Database triggers on the written tables |
| `reveal` | A credential's values are decrypted for a person | `@Audit('reveal')` on `KeychainService.reveal` |
| `denied` | Gatekeeper refused an action | `GatekeeperService.assert`, in a transaction of its own |

`detail` (`jsonb`) carries what the action needs and nothing secret: the refused action for `denied`, the grant for a share, the sync run for a run's `read`. Never values, never request bodies.

---

## 3. Table

```sql
CREATE SCHEMA audit;

CREATE TABLE audit.access_event (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at              timestamptz NOT NULL DEFAULT now(),
    user_rid        text        NOT NULL,          -- whose access; a delegate's user
    via             text,                          -- what acted for them; NULL = the user directly
    resource_rid    text        NOT NULL,
    resource_type   text        NOT NULL,          -- library.resource_type, kept: the resource may be gone
    action          text        NOT NULL CHECK (action IN ('open', 'read', 'download', 'modify', 'reveal', 'denied')),
    application_id  text,                          -- Platform.Application.Id; only for open
    detail          jsonb       NOT NULL DEFAULT '{}',
    CHECK ((action = 'open') = (application_id IS NOT NULL))
);

-- Who accessed this resource; what did this user do.
CREATE INDEX access_event_resource ON audit.access_event (resource_rid, at DESC);
CREATE INDEX access_event_user     ON audit.access_event (user_rid, at DESC);

-- Recents: this user's opens in this app, newest first.
CREATE INDEX access_event_recent   ON audit.access_event (user_rid, application_id, at DESC) WHERE action = 'open';
```

**No foreign keys.** An audit record outlives what it records: a hard-deleted resource or a removed user must not take their history with them, or block the delete. RIDs are kept as text, with the resource type alongside.

**Application ids are not checked in SQL.** The registry is code (`Platform.Application.Id`); the server validates with zod on the way in. A `CHECK` would need a migration per new app.

---

## 4. Writing

**Audit is its own service** (`services/Audit`) — the only owner of the `audit` schema ([database.md rule 1](database.md#rules)). Three ways in, one per kind of action — each declarative, so a new method or table can't quietly skip it:

| Kind | Mechanism | Why there |
|---|---|---|
| `modify` | **Triggers** (`audit.record_change`) on the tables users write | Every user and delegate transaction already sets `app.user_rid` and `app.via` (`asUser`, db/pool.ts) — a trigger knows who and via what, inside the write's transaction: committed with it, rolled back with it. It covers writes RLS allows that no service method gates (most writes have no `@SecurityGate`). Precedent: Gatekeeper's epoch triggers on foundation tables. |
| `read`, `download`, `reveal` | **`@Audit(action)`** on the service method, shaped `(principal, rid, …)` like `@SecurityGate` | Postgres has no read triggers. Records after the method succeeds, in a transaction of its own — these methods are gated, not `@Transactional`, and a read has nothing to be atomic with. The class injects `AuditService`, as `@SecurityGate`'s injects `GatekeeperService`. |
| `denied` | **`GatekeeperService.assert`** records before it throws | Every gated refusal passes through it. Its own transaction: the refusal rolls the caller's back. |
| `open` | **`POST /api/audit/open`** | The only one the client sends (below). |

The actor and `via` always come from the principal — the transaction's settings for triggers — never from the caller.

### Triggers (`modify`)

`audit.record_change()` — `SECURITY DEFINER`, owned by the audit schema's owner. Reads `current_setting('app.user_rid', true)`: unset means a service transaction (the system acting on its own) — **nothing is recorded**. Otherwise it inserts one event; the resource type comes from `library.resource`.

| Table | Fires on | Resource | `detail` |
|---|---|---|---|
| `library.resource` | INSERT; UPDATE of `name`, `parent_rid`, `trashed_at` | the row | `{ op: create \| rename \| move \| trash \| restore }` |
| `gatekeeper.role_grant` | INSERT, UPDATE, DELETE | the grant's resource | `{ op: grant \| change \| revoke, userRid or groupRid, role }` |
| `keychain.credential` | UPDATE of `blob` | the credential | `{ op: values }` — never the values |
| `data_connection.source` | UPDATE of config or credential | the source | `{ op: config }` |
| `data_connection.sync` | INSERT, UPDATE, DELETE | the sync's **source** | `{ op, syncRid }` |
| `catalog.transaction` | UPDATE to `committed` | the dataset | `{ op: commit, transactionRid, type }` (snapshot · append · update · delete) |

Creating a resource is one event (the `library.resource` insert), not one per subtype row. A sync run's commit is recorded on its dataset with `via = sync:<id>` — **only if the run commits as its delegate** (`Principal.onBehalfOf`), not as a service transaction. To verify when building: today `runs.complete` is called from the worker's internal API without a principal.

### `@Audit` (`read`, `download`, `reveal`)

| Method | Action | `detail` |
|---|---|---|
| `CatalogService.view` | read | `{ op: view, sequence }` |
| `DatasetFiles.preview` | read | `{ op: preview }` |
| `DataConnectionService.Sources.test` | read | `{ op: test }` |
| `DataConnectionService.Sources.explore` | read | `{ op: explore }` |
| `KeychainService.getEncryptedBlob` | read | `{ op: use }` — a probe (user) or a run (`via sync:<id>`) using the credential |
| `KeychainService.reveal` | reveal | — |

Not decorated: metadata gets and lists (`get`, `list`, `children`, `path`, run history) — that's discover, and the page they belong to records an `open`.

### Row-level security

User and delegate transactions run as `quarry_user` (database.md §8):

| Role | `audit.access_event` |
|---|---|
| `quarry_user` | `INSERT` only where `user_rid = current_setting('app.user_rid')` — no one records for someone else. `SELECT` only on their own `open` rows (recents). No `UPDATE`, no `DELETE`. |
| The connecting role (service transactions) | Owner: the trigger function, the admin readers (§6), retention (§7) |

### `open`

**`POST /api/audit/open { rid, application }`** — one endpoint for every resource type; services get no `openX` method. A **get is not an open**: the same `GET` serves the details panel, the location picker, breadcrumbs and React Query's refetch on focus, and it can't say which app asked. The page fetches through its normal gets; the route's `onEnter` sends one open.

Reads the resource from `library.resource` as the user — discover, or a 404 and no event — and records `open` with its type and the app (validated against `Platform.Application.Id`). Every entry into the route records one; re-entering minutes later records again — cheap, and recents take the latest anyway. Throttling (one per user, resource and app per few minutes) can come if volume says so.

---

## 5. Recents

`GET /api/audit/recents?application=datasets&limit=10` — the caller's latest opens in that app, one per resource, newest first, **only resources they can still discover and that are live** (not trashed, not deleted):

```sql
SELECT r.*
  FROM (
    SELECT DISTINCT ON (resource_rid) resource_rid, at
      FROM audit.access_event
     WHERE user_rid = current_setting('app.user_rid')
       AND application_id = $application
       AND action = 'open'
     ORDER BY resource_rid, at DESC
  ) latest
  JOIN library.resource r ON r.rid = latest.resource_rid     -- RLS: only what the user can discover
 WHERE library.is_live(r.rid)                               -- not trashed, nor under a trashed ancestor
 ORDER BY latest.at DESC
 LIMIT $limit;
```

Returns `Library.Resource.Base` rows plus `openedAt` — enough for the home screen to list and link them (the app's `opens` gives the route). Read as the user, so RLS drops anything unshared since; the join drops anything deleted.

`access_event_recent` keeps the inner query to the user's own opens in one app. When the table grows large, a small `audit.recent (user_rid, application_id, resource_rid, opened_at)` upserted by the same `open` write replaces the `DISTINCT ON` — same endpoint, same result.

---

## 6. Reading the log

- **Admins** (workspace role `admin`): `GET /api/audit/events?resourceRid=&userRid=&action=&from=&to=` — filtered, paged by `id`. Read in a service transaction, checked in the server (like `identity.*`).
- **Users**: their own recents (§5) only.

---

## 7. Retention

Kept indefinitely for now. When it matters: partition `access_event` by month on `at` (append-only data partitions cleanly) and drop or export old partitions; recents only ever need recent ones.

---

## 8. Frontend

- **`AuditSDK`** (shared — every app uses it): `actions.open(rid, application)` and `query.recents(application)`.
- **Recording**: each app's resource route calls `AuditSDK.actions.open(rid, app.id)` in `onEnter` and `onStay` (a new rid), like `sources.$rid.tsx` opens its source. A failed record is logged, never shown — it mustn't break the page.
- **Home screens**: each app's home (`/<app>`, the route without a rid) shows the app's name and description, then *Recently opened* from `AuditSDK.query.recents(app.id)`. Apps with no resource pages (Keychain) have no recents.

---

## 9. Open questions

- **Owners reading their resources' history** — should **manage** on a resource let you see who accessed it, not only admins?
- **Clearing recents** — events can't be deleted. If users should clear their list, that needs `audit.recent` (§5) with its own delete, or a "hidden before" marker per user and app.
- **RLS refusals** — a write row-level security refuses (SQLSTATE 42501) isn't recorded as `denied`: `catchDatabaseErrors` doesn't know the resource. Services gate first, so these should be rare.
- **Discover events** — never, or sampled for sensitive resources once markings exist ([gatekeeper.md §9](gatekeeper.md#9-later-mandatory-controls-markings))?
- **Export** — stream events to an external SIEM, as Foundry's audit logs export?
