# Quarry

A self-hosted data platform: connect source systems, land their data as versioned datasets, and (later) model it as an ontology people can operate on. One deployment is one workspace.

## Getting started

```bash
cp .env.example .env            # set QUARRY_BOOTSTRAP_ADMIN_EMAIL, and QUARRY_ENCRYPTION_KEY (openssl rand -hex 32)
npm install
npm run infra                   # postgres · redis · gotrue · seaweedfs (docker compose)
npm run dev                     # api + both workers + frontend at http://localhost:5173
```

The first login with `QUARRY_BOOTSTRAP_ADMIN_EMAIL` becomes the workspace admin.

Open [http://localhost:5173](http://localhost:5173), create an account with that email,
then create a project. Add a PostgreSQL credential in Keychain, connect a source
inside the project, and create a sync from a table or SQL query. Run it to inspect
its history and the output dataset's versions, schema, and file list.

To run only the frontend (the API and workers must run separately):

```bash
npm run dev:frontend
```

The frontend proxies API and authentication requests to `QUARRY_SERVER_URL` and
`GOTRUE_URL` from the root `.env`. See [frontend setup](platform/frontend/README.md)
for its structure, build commands, and deployment configuration.

Three folders (docs/design/architecture-split.md): **`platform/`** — what every application stands on; **`applications/<application>/<part>`** — one folder per application, one package per process it runs; **`libraries/`** — code to import, nothing that runs on its own.

| Package | What |
|---|---|
| `platform/server` (`@quarry/platform-server`) | The main server (NestJS): identity, Library, grants, Keychain, audit's store, the realtime gateway, token minting; **all migrations**; the proxy to each application's server (`/api/<application>/…`) |
| `platform/kernel` (`@quarry/platform-kernel`) | The shared kernel every server runs in-process: auth, the database layer, queues and storage, Identity / Library / Gatekeeper / Audit / Realtime, microservice calls over NATS |
| `platform/system-worker` | Housekeeping: storage GC, stuck-run reaper, schedule reconcile, sweeps, storing audit records |
| `platform/frontend` | The web app (React/Vite): every application's UI on one shell, typed SDK stores, file-based routes |
| `applications/catalog/server` | Datasets, their storage and DuckDB — its own process and database login |
| `applications/data-connection/server` | Sources, syncs and their runs — its own process and login; Catalog and Keychain through microservice calls |
| `applications/data-connection/worker` | Runs syncs and source probes — the only process that reaches source systems |
| `applications/code-workspace/{worker,runtime,vscode-extension,transforms-python}` | IDE sessions and checks (Docker); the runtime in a session or a job; the VS Code extension; the Python transforms library. Its server code is still in the main server, paused by the split |
| `applications/forge/agent` | Runs build jobs in containers. Forge's server code is still in the main server, paused by the split |
| `libraries/shared` | Domain types + API contracts (zod), server helpers |
| `libraries/standard-ui` | Shared React components, theme styles, icons, and DialogSDK |
| `libraries/integrations` | One folder per external system (Postgres, …): source definition, credential template, runtime |

## Application logs

The API and workers use `System.log` from `@quarry/shared/server/system`.
Each process sets its name at startup; services use `System.log.withContext('ServiceName')`.
The logger writes colored console output with a timestamp, level, process name, and service context.
Calls accept optional metadata; a numeric `ms` field renders as a trailing duration.
Keep credentials and request authorization headers out of log messages and metadata.

Set `LOG_LEVEL` to `debug`, `info` (default), `warning`, or `error`.
Set `LOG_TIMESTAMPS=false` when the collector adds timestamps, or `LOG_APP_NAME`
to override the process name. These settings also pass through Docker Compose.
Nest's framework messages retain its default logger and are separate from `LOG_LEVEL`.

## Docs

- [Code-writing guidelines](AGENTS.md)
- [Architecture & file structure](docs/design/architecture.md)
- [Database design](docs/design/database.md)
- [Jobs & queues](docs/design/jobs.md)
- [Gatekeeper — authorization](docs/design/gatekeeper.md)
- [Keychain — credentials](docs/design/keychain.md)
- [Catalog — datasets](docs/design/catalog.md)
- [Data Connection — sources and syncs](docs/design/data-connection.md)
- [Research: Palantir Foundry's ontology](docs/research/palantir-foundry-ontology.md)
