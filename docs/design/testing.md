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
- **Each test makes its own data** — its own project, datasets and specs — so tests don't depend on each other; files run one after another (one database).
- `test/support/env.ts` points every test process at both before any module reads its env.

## Writing integration tests

`test/support/forge-fixtures.ts` — `ForgeHarness`: the server's services in one Nest context, plus helpers — test users (admins unless asked), a project with datasets (optionally with a committed version, so they can be inputs), publishing specs by dataset name, manual builds, statuses by spec name. **The test plays the ForgeAgent** (`run(job)`: start, then finish), so the order of events is the test's, not a race — no agent process, no sleeps.

Failures the code can't produce on demand (a relay crash, Redis losing a message) are simulated directly: `setStatus`, `backdateQueued`, removing a BullMQ job.

Conventions: test through public service methods, not private helpers; no `sleep` — drive the steps, or poll with a timeout; one behaviour per test, named as a sentence.

**Check a new test can fail.** Break the rule it guards and run it: when written, the diamond test caught readiness changed from "every parent" to "some parent", and the start-once test caught `start` accepting a running job — each failed alone, the rest passed.

## What's covered

`npm test` from the root runs both packages: **158 tests**, about 17 s.

**`@quarry/shared`** (74 unit tests, next to the code; Vitest without SWC — no decorators): `Build.Plan` (`getParents`, `getReadyChildren` on a diamond, schema), `Build.Target`, `Job` (`getOutputTransactions`, unfinished statuses), `Queue.RunJob` (job ids — no `:`, one per attempt), `Forge.Event` (channel round trip, `create` without channel), `Realtime.Event.defineFactory`, `Branch`, `Commit`, `ModuleFunctionPath`, `Rid`, `Check.Config` (quarry-ci.yml's rules) and `Check.Manifest`. Its `tsconfig.json` excludes `*.test.ts`, so `tsc -b` never emits tests into `dist`; `tsconfig.test.json` typechecks them.

**`packages/server`** (84 integration and end-to-end tests):

| File | Covers |
|---|---|
| `test/forge/build-graph` | chain, diamond (D waits for both B and C), fan-in (three roots queued at once), a spec with two outputs (one job; building one output writes both), a failure mid-build (the rest canceled, every output aborted, build failed), canceling mid-way |
| `test/forge/build-validation` | target nothing produces, input without data, input built in the same build, a cycle, upstream/connecting and non-main refused, fallback branches, a target listed twice, a trashed target; the output lock — every output of every job held until the build ends, all or none (a busy output opens nothing else), a second build refused, an upload let in after |
| `test/forge/permissions` | as non-admin members — editor, viewer, discoverer, no grant: who may start, see, list, cancel builds and publish or read specs; 403 vs 404 (no grant never learns a build exists) |
| `test/forge/job-specs` | pointers per output, republish moves them, dropped outputs lose them, an empty publish, duplicate outputs (400), another producer's dataset (409, nothing changed), branches kept apart, fallback order |
| `test/forge/agent-api` | start once; start from `scheduled`; idempotent finish; the attempt as fencing token; outputs aborted |
| `test/forge/relay` | the fast path; the sweep re-sends scheduled and stale queued jobs (restarting the clock), leaves recent and running ones alone |
| `test/forge/events` | the exact event sequence of a two-job build; failure and cancel events; one channel per build |
| `test/code-workspace/check-runs` | `getMovedHeads`; runs queued per moved branch as the pusher, superseding the branch's unfinished runs (not finished ones, not other branches); reader vs writer; **real pushes over HTTP** with a session token (git CLI against a server on a random port): the pushed head only, several branches, nothing for a rejected push, a fetch or a deleted branch, a viewer's push refused (403) |
| `test/catalog/transaction-batches` | `openBatch` (order, all or none, duplicates, trashed datasets), `abortBatch` (skips committed, idempotent, only through its own dataset) |
| `test/e2e/forge-agent.e2e` | **a real ForgeAgent process** against the server over HTTP on a random port: a one-job build and a diamond run to the end in dependency order; canceling against a running agent (no canceled job turns succeeded); a late finish of a canceled job refused |

The end-to-end file lives in the server package for now (it drives the server and spawns `packages/forge-agent`); it moves to `tests/e2e/` at the root when more packages take part. It boots the agent with ts-node (~3 s) and was stable over repeated runs.

**What the tests found** (fixed when written):

- A viewer canceling a build got **409 "finished meanwhile"** instead of 403 — RLS silently matched no rows. Canceling now asserts write on the targets first.
- When a job failed, its own `failed` event went out **after** the `canceled` events it caused. Events now follow the order of the commits.
- Canceling (and failing a build) aborted outputs **before** marking jobs canceled, so a running job could still finish in between — with compute, a build reported succeeded whose outputs a cancel had just aborted. Now they're marked first; a late finish gets 409, and the agent drops that outcome.

## Next

- The realtime gateway's authorization through a real socket (a build's channel for members who can and can't see it).
- End to end with compute, once ForgeAgents run containers: committed outputs, inputs pinned at start.
- Data Connection, Catalog uploads and the Library — untested so far.
- CI: Testcontainers (throwaway Postgres and Redis per run) instead of the dev ones.
