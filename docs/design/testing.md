# Testing

_Started 2026-10-27 with Forge. Before this, only `transforms-python` had tests (pytest)._

## Layers

| Layer | What | Infrastructure | Where |
|---|---|---|---|
| **Unit** | pure logic — plan helpers, schemas, small functions | none | next to the file: `src/**/*.test.ts` |
| **Integration** | a service and its repository against a **real Postgres and Redis**: flows, conditional updates, constraints, row-level security | the test database | the package's `test/`, by service: `packages/server/test/forge/` |
| **End to end** | several processes — server, ForgeAgent, system worker — over HTTP, Redis and the socket | everything running | the repo root, `tests/e2e/` (not yet) |

Most of the value is in integration tests: Forge's correctness lives in SQL — `WHERE status IN (…) AND attempt = …`, unique keys, RLS policies — which a mocked repository wouldn't exercise. Mock only real external boundaries; Postgres and Redis aren't mocked.

## Running

```
npm test                         # from the repo root: shared and server
npm run test:watch -w packages/server
npm run typecheck -w packages/server   # source and tests (tsconfig.test.json)
```

Needs the dev Postgres and Redis (`npm run infra`). **Vitest** (5.0.4) with **unplugin-swc**: SWC emits the decorator metadata Nest's dependency injection needs, which Vitest's default esbuild doesn't. Config: `packages/server/vitest.config.ts`.

## Isolation

- **Database `quarry_test`** on the dev Postgres — dropped, created and migrated at the start of every run (`test/support/global-setup.ts`). The migrations are living files, so it's rebuilt rather than reused; a run takes a few seconds.
- **Git root `$TMPDIR/quarry-test-git`** — Code Workspaces' bare repositories (`QUARRY_GIT_ROOT`), emptied at the start of every run; the dev ones (`.data/git`) are never touched.
- **Redis database 15** — BullMQ's keys are per database, so test jobs never reach dev queues or a running ForgeAgent. Flushed at the start of every run. (Pub/sub isn't per database: a test's realtime events go to the dev Redis's channels, with random build RIDs nobody listens on.)
- **The dev bucket (`S3_BUCKET`)** — Data Connection tests write a run's files under random dataset RIDs, as the worker would; `DataConnectionHarness.stop()` deletes every prefix it wrote.
- **A throwaway database per run of `source-probes`** — `quarry_test_source_<random>` on the dev Postgres, the "external" system the worker connects to; created with its tables in `beforeAll`, dropped in `afterAll`.
- **Each test makes its own data** — its own project, datasets and specs — so tests don't depend on each other; files run one after another (one database).
- `test/support/env.ts` points every test process at both before any module reads its env — and `CODE_WORKSPACE_WORKER_URL` at a closed port, so no test reaches a running Code Workspace worker.
- **Two runs at once** (two terminals, two agents) would drop each other's database: give one its own with `QUARRY_TEST_DATABASE=quarry_test_2 QUARRY_TEST_REDIS_DATABASE=14 QUARRY_TEST_GIT_ROOT=/tmp/quarry-test-git-2 npm test`.

## Writing integration tests

`test/support/forge-fixtures.ts` — `ForgeHarness`: the server's services in one Nest context, plus helpers — test users (admins unless asked), a project with datasets (optionally with a committed version, so they can be inputs), publishing specs by dataset name, manual builds, statuses by spec name. **The test plays the ForgeAgent** (`run(job)`: start, then finish), so the order of events is the test's, not a race — no agent process, no sleeps.

Failures the code can't produce on demand (a crash between sending and marking, Redis losing a message) are simulated directly: `setStatus`, `backdateSent` (an outbox message sent long ago), removing a BullMQ job.

`test/support/data-connection-fixtures.ts` — `DataConnectionHarness`, the same idea for Data Connection: users, projects, Postgres credentials and sources, syncs (append by default, snapshot on request). **The test plays the Data Connection worker**: `startRun`, then `writeCopy` (uploads what a copy would under the run's prefix — not real Parquet: the server only lists keys) and `completeRun`, or `run.fail`; `backdateHeartbeat` for a worker that died. A crash between two writes is simulated with a temporary Postgres trigger (`refuseSucceeding` in `publishing.test.ts`).

A test that pins down a **known bug** is `it.fails`: it passes while the bug is there and turns red once it's fixed — then make it a plain `it`.

Conventions: test through public service methods, not private helpers; no `sleep` — drive the steps, or poll with a timeout; one behaviour per test, named as a sentence.

**Check a new test can fail.** Break the rule it guards and run it: when written, the diamond test caught readiness changed from "every parent" to "some parent", and the start-once test caught `start` accepting a running job — each failed alone, the rest passed.

Data Connection's, checked the same way (each mutation failed only the tests named): complete/fail only while running (the two fail tests — a second complete is also refused by Catalog's own open-transaction check); the `sync_run_one_running` index (the second-start test); heartbeat only on a running run; the reaper only for stale heartbeats; the state from the last *successful* run (both state tests); registering only the run's own prefix; run history needs read, not discover; a run uses the credential as its delegate, not the system; a failed run is announced (the two event tests).

## What's covered

`npm test` from the root runs both packages: **359 tests** (and 1 expected failure — a known bug, below), about 45 s.

**`@quarry/shared`** (97 unit tests, next to the code; Vitest without SWC — no decorators): `Build.Plan` (`getParents`, `getReadyChildren` on a diamond, schema), `Build.Target`, `Job` (`getOutputTransactions`, unfinished statuses), `Queue.RunJob` (job ids — no `:`, one per attempt) and `DurableQueue.RunJob`, `Forge.Event` (channel round trip, `create` without channel), `DataConnection.Event` and `CodeWorkspace.Event` (the same, per source and per workspace), `DataConnection.Sync.Schedule` (five-field cron or null), `DataConnection.Queue.Sync` (one deduplication id per sync, triggers), `Realtime.Event.defineFactory`, `Branch`, `CodeWorkspace.Git` (`Commit`, `Heads`, `getMovedHeads`), `ModuleFunctionPath`, `Rid`, `Check.Config` (quarry-ci.yml's rules) and `Check.Manifest`. Its `tsconfig.json` excludes `*.test.ts`, so `tsc -b` never emits tests into `dist`; `tsconfig.test.json` typechecks them.

**`packages/server`** (262 integration and end-to-end tests, and 1 expected failure):

| File | Covers |
|---|---|
| `test/forge/build-graph` | chain, diamond (D waits for both B and C), fan-in (three roots queued at once), a spec with two outputs (one job; building one output writes both), a failure mid-build (the rest canceled, every output aborted, build failed), canceling mid-way |
| `test/forge/build-validation` | target nothing produces, input without data, input built in the same build, a cycle, upstream/connecting and non-main refused, fallback branches, a target listed twice, a trashed target; the output lock — every output of every job held until the build ends, all or none (a busy output opens nothing else), a second build refused, an upload let in after |
| `test/forge/permissions` | as non-admin members — editor, viewer, discoverer, no grant: who may start, see, list, cancel builds and publish or read specs; 403 vs 404 (no grant never learns a build exists) |
| `test/forge/job-specs` | pointers per output, republish moves them, dropped outputs lose them, an empty publish, duplicate outputs (400), another producer's dataset (409, nothing changed), branches kept apart, fallback order |
| `test/forge/agent-api` | start once, acking its message (kept when refused); idempotent finish; the attempt as fencing token; outputs aborted |
| `test/forge/delivery` | Forge's durable queue: a root's message sent at once, none for a waiting job, a child's added when its parent succeeds, the sweep resending one Redis lost and leaving a recent one alone, acked on start, on cancel and when a failure cancels the rest |
| `test/infra/durable-queues` | the platform piece, over a throwaway queue: add joins the domain's transaction (rolls back with it, works under a user's row-level security, refused outside a transaction, a job id added twice kept once, checked against the job schema); relay sends then marks, oldest first, keeps unsent when Redis refuses, never duplicates; the sweep sends the unsent and the stale-unacked, leaves the recent and the acked alone, leaves an unregistered queue's messages in place; ack deletes in its transaction (rolled back → kept), works under a user, through the internal API |
| `test/forge/events` | the exact event sequence of a two-job build; failure and cancel events; one channel per build |
| `test/code-workspace/check-runs` | runs queued per moved branch as the pusher, superseding the branch's unfinished runs (not finished ones, not other branches); reader vs writer; **real pushes over HTTP** with a session token (git CLI against a server on a random port): the pushed head only, several branches, nothing for a rejected push, a fetch or a deleted branch, a viewer's push refused (403) |
| `test/code-workspace/check-scheduling` | scheduling, reading the real `code-workspace.run-check` queue in the test Redis and the outbox: a waiting run scheduled with its steps laid out and its message added and sent, **one at a time per workspace** (running counts; the next once it finishes; the unique index refusing a second, its message rolled back with it), workspaces in parallel, Redis down leaves the message in the outbox for the durable-queue sweep, quarry-ci.yml missing / unparsable / invalid fails at Parse unscheduled, superseding acks and frees the workspace, coalesced calls; the worker's reports (the test plays it): start once acking the message, step reports at their place, log tail, bad step index, finish with a valid / invalid / missing manifest, failure skips the rest, no second finish, a canceled run's reports refused; the sweep: silent after 35 min failed and its workspace freed, recent ones and long-scheduled ones left alone |
| `test/code-workspace/template` | the python-transforms template passes its own first check: a valid quarry-ci.yml; rendered and run with transforms-python's environment, its tests pass and its manifest is accepted — with the example (publishing it) and without (publishing nothing) |
| `test/code-workspace/check-run-history` | the Checks tab's data: pages newest first until `nextBefore` is null, stable when runs arrive meanwhile (keyset), by branch, one run only through its own workspace; reader / discoverer (403) / outsider (404); events on the workspace's channel, heard on Redis — a run's whole life in order (pushed-and-scheduled as one event, each step), a superseded run canceled and its successor, a waiting run's scheduling after the run before it fails |
| `test/catalog/transaction-batches` | `openBatch` (order, all or none, duplicates, trashed datasets), `abortBatch` (skips committed, idempotent, only through its own dataset) |
| `test/data-connection/run-lifecycle` | start (a running run, the transaction open — append for incremental, snapshot for a full copy; scheduled runs act for no one; a missing sync skipped); one run per sync (a second start 409, nothing recorded; the next starts once it's done); heartbeat (renews a running run, leaves a finished one); complete and fail only while running (duplicate or late ones 409, the first outcome kept); the reaper (stale runs failed and aborted, live and finished ones left, the sync freed) |
| `test/data-connection/publishing` | complete → a committed version with the copy's files, row counts and schema; only Parquet under the run's own prefix; incremental runs add, full copies replace; the state moves from run to run, and a failed or reaped run moves nothing; together or not at all — a commit refused mid-run (output trashed) commits nothing and the worker's fail aborts, a duplicate complete changes nothing, **and the known bug** (below) |
| `test/data-connection/syncs` | create (its dataset in the folder asked, the parsed config; a bad config 400 with no dataset; a taken name 409); a job scheduler only for scheduled syncs; listing per source; run now (queued as the presser, once however often pressed; another source's sync or a trashed output 404); a run while one is running — queued, then refused at start (409); the schedules the system worker mirrors — each once, no manual ones |
| `test/data-connection/sources` | the definitions on offer; create (in the folder, naming its credential; unknown type or no credential 400; unknown settings dropped; the default output a project or folder, not a dataset); get, require, list; trashed = gone; open records an audit `open` in its app — nothing for a missing source; users only (a delegate 403) |
| `test/data-connection/permissions` | as admin, editor, viewer, discoverer and no grant: seeing, opening and listing sources; probing them (test, explore, preview: 403 for a discoverer, 404 with no grant); creating sources and syncs (no dataset left behind when refused); listing syncs; run now; run history (403 for a discoverer, not an empty list). No grant always gets the same 404 as a source that doesn't exist |
| `test/data-connection/credentials` | the credential handed only to someone with read on it (403 discover, 404 no grant), encrypted; a source can't name one its creator can't read; a run acting for someone who can't read it is refused and recorded failed, no transaction left open; neither the values nor the blob appear in any user-facing response (sources, syncs, runs, Keychain) |
| `test/data-connection/events` | `data-connection:run:updated` on the source's channel, in order (running → succeeded / failed), across consecutive runs; failed and reaped runs notify whoever the run acted for (the sync's creator for a schedule); nothing for a refused start; each source's runs on its own channel |
| `test/e2e/source-probes.e2e` | **a real Data Connection worker process** (request–reply over Redis) against a throwaway Postgres database: test passes, explore lists the tables across schemas, preview returns typed columns and rows, each probe audited; a missing table, a wrong password (424 with the reason, no password in it) and an unreachable host fail cleanly |
| `test/e2e/forge-agent.e2e` | **a real ForgeAgent process** against the server over HTTP on a random port: a one-job build and a diamond run to the end in dependency order; canceling against a running agent (no canceled job turns succeeded); a late finish of a canceled job refused |

The end-to-end file lives in the server package for now (it drives the server and spawns `packages/forge-agent`); it moves to `tests/e2e/` at the root when more packages take part. It boots the agent with ts-node (~3 s) and was stable over repeated runs.

**What the tests found** (fixed when written):

- A viewer canceling a build got **409 "finished meanwhile"** instead of 403 — RLS silently matched no rows. Canceling now asserts write on the targets first.
- When a job failed, its own `failed` event went out **after** the `canceled` events it caused. Events now follow the order of the commits.
- Canceling (and failing a build) aborted outputs **before** marking jobs canceled, so a running job could still finish in between — with compute, a build reported succeeded whose outputs a cancel had just aborted. Now they're marked first; a late finish gets 409, and the agent drops that outcome.

**What the Data Connection tests found** (not fixed — reported; the service wasn't changed):

- **A crash between commit and marking the run succeeded leaves the data committed and the run running** — the reaper then fails it, and the next incremental run starts before rows that were already committed (an append sync loads them twice). Pinned by the `it.fails` test in `publishing.test.ts`; see [data-connection.md §7](data-connection.md#7-open-questions).
- **Explore lists Postgres's own catalogs** — 142 `pg_catalog` and 69 `information_schema` tables beside the source's real ones. Noted in [data-connection.md §7](data-connection.md#7-open-questions).

## Next

- The realtime gateway's authorization through a real socket (a build's channel for members who can and can't see it).
- End to end with compute, once ForgeAgents run containers: committed outputs, inputs pinned at start.
- Catalog uploads and the Library — untested so far.
- Data Connection: a real sync run end to end (the worker copying with DuckDB to the bucket, then complete).
- CI: Testcontainers (throwaway Postgres and Redis per run) instead of the dev ones.
