# Quarry

A self-hosted data platform: connect source systems, land their data as versioned datasets, and (later) model it as an ontology people can operate on. One deployment is one workspace.

## Getting started

```bash
cp .env.example .env            # set QUARRY_BOOTSTRAP_ADMIN_EMAIL to your GoTrue login
npm install
npm run infra                   # postgres · redis · gotrue · minio (docker compose)
npm run dev                     # api (migrates on boot) + sync worker + system worker
```

The first login with `QUARRY_BOOTSTRAP_ADMIN_EMAIL` becomes the workspace admin.

| Package | What |
|---|---|
| `packages/shared` | Domain types + API contracts (zod), used by server and frontend |
| `packages/server` | One codebase, three entry points: `src/api.ts`, `src/workers/sync.ts`, `src/workers/system.ts` |

## Docs

- [Architecture & file structure](docs/design/architecture.md)
- [Database design](docs/design/database.md)
- [Jobs & queues](docs/design/jobs.md)
- [Gatekeeper — authorization](docs/design/gatekeeper.md)
- [Catalog — datasets](docs/design/catalog.md)
- [Data Connection — sources and syncs](docs/design/data-connection.md)
- [Research: Palantir Foundry's ontology](docs/research/palantir-foundry-ontology.md)
