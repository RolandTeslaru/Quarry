# Review: split phase 2, and the restructure

_Written 2026-11-01. Against commit `1d2893d` (phase 1). What's left to read after the mechanical part — 668 files moved unchanged, or changed only in import specifiers, package names and paths — was staged without review: their correctness is the typecheck's, the suites' and the builds'. Everything below has real content. Plan and decisions: [architecture-split.md](../design/architecture-split.md)._

## 1. Microservice-call framework — read closely

| File | Look for |
|---|---|
| `platform/kernel/microservice/service-tokens.ts` | Only the main server signs (private key); everyone verifies (public key, audience, expiry). A service gets its own token with its secret over HTTP; failures aren't cached |
| `platform/kernel/microservice/microservice-caller.ts` | Who a call acts as: the request's own token for its user, a minted token for a delegate or a user outside their request, nothing for the service itself. Refusals rethrown as the callee's exception class |
| `platform/kernel/microservice/microservice-call-receiver.ts` | Before any handler: service token (401), `from` (403), the user's token verified as on HTTP, the request parsed (400); the handler runs with that user as the request identity |
| `platform/kernel/microservice/microservice-call.decorator.ts`, `microservice-client.ts`, `clients.ts`, `microservice-calls.module.ts`, `subjects.ts` | The decorator wraps `@MessagePattern`; clients generated from `Calls` (no hand-written methods); the per-environment subject namespace |
| `platform/kernel/auth/request-identity.ts`, `auth/auth.guard.ts` | The request's user and token, kept for calls made while handling it |
| `libraries/shared/domain/Foundations/MicroserviceCall.ts`, `{Catalog,Keychain,Identity}/service.ts` (+ their `index.ts`) | The contracts: each call's subject, request, response; `Calls` is a service's whole callable surface |

## 2. Database roles — read closely

| File | Look for |
|---|---|
| `platform/server/migrations/foundations/001_initial.sql` | `create_service_roles(schema, resource_types)`: what each role gets; the restrictive Library policies; Kysely's history excluded (already staged) |
| `platform/server/migrations/catalog/001_initial.sql`, `data_connection/001_initial.sql` | One call each, at the end (already staged) |
| `platform/kernel/db/service-logins.ts` | Each service's login set from its URL (dev and tests) |

## 3. The main server

| File | Look for |
|---|---|
| `platform/server/src/auth/service-tokens.controller.ts` | Issuing a service's token: internal token + the service's secret |
| `platform/server/src/services/{Identity,Keychain}/controllers/microservice-calls.controller.ts` | Minting a user's token (`from: data-connection`); a credential for a run, as the acting user |
| `platform/server/src/api.ts`, `main-server.module.ts`, `http/main-server.ts`, `auth/session-tokens.ts`, `migrations-folder.ts` | Joins NATS as `main`; proxies `/api/catalog`, `/api/data-connection`; the Realtime gateway split; session tokens' TTL as a number |
| `platform/server/src/services/Realtime/realtime-gateway.module.ts`, `platform/kernel/services/Realtime/realtime.module.ts` | Emit in the kernel; the gateway stays here |

## 4. Catalog and Data Connection

| File | Look for |
|---|---|
| `applications/catalog/server/src/microservice.controller.ts` | The six calls Data Connection makes, `from: ['data-connection']` |
| `applications/catalog/server/src/{main.ts,microservice.module.ts}`, `catalog/controllers/http.controller.ts` | Joins NATS; `catalog/datasets` prefix |
| `applications/data-connection/server/src/{main.ts,microservice.module.ts,load-env.ts}` | Its own process, login, NATS, port 4020 |
| `applications/data-connection/server/src/{source,sync,sync-run}/` | `CatalogClient` / `KeychainClient` instead of in-process services (eight call sites); `data-connection/sources` prefix |
| `libraries/shared/domain/Catalog/api/dataset.ts`, `DataConnection/api/{source,sync}.ts` | The per-service URL prefixes |

## 5. Workers

| File | Look for |
|---|---|
| `libraries/shared/server/internal-api.ts` | `getDataConnectionApi()`; `waitForServer(target)` |
| `applications/data-connection/worker/src/{main,processors}.ts`, `platform/system-worker/src/{schedules.ts,processors/sync-reaper.processor.ts}` | Data Connection's internal calls go to its service |

## 6. Tests — skim

`applications/data-connection/server/test/support/{global-setup,env,data-connection-fixtures}.ts` (the main server and Catalog as processes; owner fixtures), `test/data-connection/{credentials,publishing,syncs}.test.ts`, `test/e2e/source-probes.e2e.test.ts`; `platform/server/test/e2e/catalog-service.e2e.test.ts` (the framework's cases), `test/architecture/{package-boundaries,repositories}.test.ts` (every package).

## 7. Configuration and layout — skim

Root `package.json` (workspaces, scripts), `docker-compose.yml` (NATS), `Dockerfile` (paths only — it already predated phase 1: it builds the main server and two workers, not Catalog or Data Connection), `.env.example`, each package's `package.json` / `tsconfig.json` / `vitest.config.ts`, `platform/frontend/src/shell/apps.ts`, `package-lock.json` (regenerated; already staged).

## 8. Docs — skim

`docs/design/*` and `README.md`: paths and package names, phase 2 as built, the layout.
