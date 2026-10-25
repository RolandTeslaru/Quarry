# Running a preview

**Preview** runs one transform **as it is in the working copy** — saved, not necessarily committed — on **samples** of its inputs, and shows its outputs under the editor. It writes nothing anywhere.

## End to end

```mermaid
sequenceDiagram
    autonumber
    participant P as Page (routes/$rid/route.tsx)
    participant S as Server
    participant W as Worker (SessionManager)
    participant C as Session container
    participant R as Runner (python -m quarry.transforms.preview)
    participant L as Library / Catalog
    participant O as Object storage

    P->>S: POST /api/code-workspaces/:rid/session/preview { transform, rows: 1000 }
    Note over S: @RequireUserPrincipal → @SecurityGate('read') → get
    S->>W: POST {worker}/sessions/preview { workspaceRid, userRid, transform, rows } (≤ 5 min)
    W->>S: session-credentials → a fresh token (re-checked: read)
    W->>C: docker exec -w /workspace/repo .venv/bin/python -m quarry.transforms.preview {transform} --rows 1000<br/>env: QUARRY_TOKEN, QUARRY_SERVER_URL (by name)
    C->>R: start
    R->>R: import src/{package}/pipeline.py — discover transforms
    loop each Input
        R->>L: GET /api/resources/by-path?path=… (or the RID as is)
        R->>L: GET /api/datasets/{rid}/sample?rows=1000
        L->>O: DuckDB: SELECT … USING SAMPLE reservoir(1000 ROWS)
        L-->>R: Parquet file + X-Quarry-Sequence
    end
    loop each Output
        R->>L: by-path → the RID, or none yet
    end
    R->>R: run the function (stdout and ctx.log captured)
    R-->>C: one JSON object on stdout (exit 0, or 1 with { error })
    C-->>W: stdout
    W->>W: CodeWorkspace.Preview.Result.parse
    W-->>S: the result
    S-->>P: result
    P->>P: PreviewPanel — a tab per output (TableViewer), logs, or the traceback
```

## The runner

`transforms-python/src/quarry/transforms/preview.py`, run in the workspace's root:

1. **Find the pipeline** — `src/*/pipeline.py`, imported fresh (a new Python process per preview, so edits always apply). It must define `pipeline = Pipeline()`.
2. **Find the transform** by name — `module.function` (`sales_cleaning.datasets.example.example`).
3. **Sample each input** into a temporary directory — `QuarryClient.resolve` (a RID as is; a path via `by-path`) then `sample` (writes `sample.parquet`, returns the version).
4. **Prepare outputs** — `TransformOutput(rid, writer)`; `write_table` converts Polars / pandas / Arrow / DuckDB to an Arrow table and keeps it in memory.
5. **Call the function** with `TransformInput`s, `TransformOutput`s, and `ctx` if it takes one (`ctx.duckdb()` registers each input as a view). `print` and `ctx.log` go to `logs`, never stdout.
6. **Check** every output was written.
7. **Print** `{ transform, inputs: { name: { rid, sequence } }, outputs: { name: { columns, rows (≤ 1000), rowCount } }, logs }`. Column types are mapped from Arrow to Quarry's (`integer`, `long`, `double`, `boolean`, `date`, `timestamp`, `decimal(p,s)`, `binary`, `string`).

A transform that **raises** (or a pipeline that doesn't import) prints `{ error: { message, traceback } }` and exits 1. That's an **answer**, not a failed request: the panel shows the message and traceback. A failed *request* is a toast: no open session (409), the worker down or too slow (503), the worker failing (424, with its reason).

`--list` prints the declared transforms instead — what the header's picker shows (`GET …/session/transforms`, re-read whenever the picker opens).

## The sample

`GET /api/datasets/:rid/sample?rows=` (`CatalogStorage.sample`, `catalog.controller.ts`):

```mermaid
flowchart LR
    Q["sample(principal, rid, rows)<br/>@Audit read · @SecurityGate read"] --> V["resolveView: the latest version's<br/>files + schema (409 if none)"]
    V --> D["DuckDB in the server:<br/>COPY (SELECT … FROM read_parquet/read_csv(files)<br/>USING SAMPLE reservoir(N ROWS)) TO tmp.parquet"]
    D --> R["controller: Content-Type parquet,<br/>X-Quarry-Sequence: version"]
    R --> S["pipeline(file → response),<br/>then delete the temp file"]
```

Sessions can't read storage themselves — they hold no storage credentials, and a dataset's version and schema live in Postgres. **Cost**: a reservoir sample scans the whole dataset, on every preview, in the server process. Fine at today's sizes; the planned fix is a per-version cached sample with block (`system`) sampling — see transforms.md.

## Timeouts

| Step | Limit |
|---|---|
| Server waiting for the worker (`CodeWorkspaceWorkerClient`) | open 5 min · preview 5 min · transforms 1 min |
| Worker waiting for `docker exec` | setup 5 min · preview 5 min · list 1 min |
| Runner's HTTP calls to Quarry | 120 s each |
