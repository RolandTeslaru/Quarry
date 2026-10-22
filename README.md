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
`GOTRUE_URL` from the root `.env`. See [frontend setup](packages/frontend/README.md)
for its structure, build commands, and deployment configuration.

| Package | What |
|---|---|
| `packages/shared` | Domain types + API contracts (zod), used by server and frontend |
| `packages/integrations` | One folder per external system (Postgres, …): source definition, credential template, runtime |
| `packages/server` | The CRUD backend (NestJS) — the only package with database access; `/api/internal/…` for the workers |
| `packages/data-connection-worker` | Runs syncs and source probes — the only process that reaches source systems (decrypts their Keychain credentials) and runs DuckDB |
| `packages/system-worker` | Housekeeping: outbox relay, storage GC, stuck-run reaper, schedule reconcile |
| `packages/standard-ui` | Shared React components, theme styles, icons, and DialogSDK |
| `packages/frontend` | React/Vite app: Blueprint controls, Tailwind layout, typed SDK stores, and file-based routes |

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
