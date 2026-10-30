# Forge — Runtimes and delegates

_Design, 2026-10-29. **Phases 1 and 2 built 2026-10-29** (§8): the contract, the stdio transport, the code-workspace runtime and its image, the ForgeAgent running jobs in containers; the job token, and the runtime cloning the commit, installing its lock and finding the transform. Reading and writing data (phases 3–4) are design. Decided with the user: runtimes as Nest microservices over stdio; one container per job; inputs read through presigned URLs; one shared uv cache per ForgeAgent machine. Extends [forge.md](forge.md) §5 (ForgeAgents and job containers); preview today is described in [transforms.md](transforms.md)._

A **runtime** is what does a Quarry application's compute. Every application that produces recipes has one: Code Workspaces first, later Pipeline Builder and Data Connection. It runs inside a container, takes instructions over stdio, and is the one interface for everything that wants that application's compute — a ForgeAgent running a build job, the IDE running a preview, a check run listing transforms.

## 1. The pieces

```mermaid
flowchart TB
    subgraph server["Server"]
        forge["<b>Forge</b><br/>plans the build, creates the jobs<br/>queues RunJob { jobRid, attempt }<br/>at claim: pins the inputs, mints the job token"]
    end

    subgraph machine["Agent machine (one or many)"]
        agent["<b>ForgeAgent</b><br/>picks a job when a slot is free<br/>image = runtimeImages[recipe.runtime.type]<br/>docker run, limits from recipe.compute<br/>heartbeats, kill on cancel"]
        cache[("cache volume<br/>per runtime type, at /cache")]

        subgraph container["Job container"]
            runtime["<b>runtime</b><br/>Nest microservice<br/>receives run { job, token }"]
            work["<b>the work</b><br/>code-workspace: spawns Python<br/>pipeline, data-connection: the runtime itself"]
        end
    end

    storage[("Storage")]

    forge -- "RunJob message" --> agent
    agent -- "POST start / finish" --> forge
    agent -- "stdin / stdout" --> runtime
    cache -. "mounted" .- container
    runtime --> work
    runtime -- "job token: input URLs, uploads, register files" --> forge
    work -- "reads and writes Parquet via presigned URLs" --> storage
```

| Application | `recipe.runtime.type` | Runtime image | Does the work |
|---|---|---|---|
| Code Workspaces | `code-workspace` | `quarry/code-workspace-runtime` | spawns Python (`quarry.transforms`) per operation |
| Pipeline Builder (later) | `pipeline` | `quarry/pipeline-runtime` | itself: its engine |
| Data Connection (later) | `data-connection` | `quarry/data-connection-runtime` | itself: the sync |

Forge never knows a runtime's details. It plans, pins, locks, commits and aborts; the runtime is the application's.

### Runtime images

A recipe's `runtime` names the runtime that runs it (`type`) and holds what that runtime needs — for a workspace, `{ type: 'code-workspace', workspaceRid, commit, transform }`. The ForgeAgent has one map from type to image, and nothing else per application:

```ts
const runtimeImages: Record<Forge.Recipe.Runtime['type'], string> = {
    'code-workspace': 'quarry/code-workspace-runtime:<version>',
};
```

Everything else is the same for every runtime, so the ForgeAgent does it once: start the container (`docker run -i --rm`, limits from `recipe.compute`), mount the runtime type's **cache volume** at `/cache`, send `run` on stdin, turn `log` and `progress` into heartbeats, kill on stop, turn `done` into `finish`. A runtime uses `/cache` or ignores it — the code-workspace runtime keeps its uv cache there.

A new application adds one entry to the map and builds its runtime image; it writes no ForgeAgent code. An unknown type throws, and the job fails. If per-lock environment images come back, the value becomes a function of the recipe.

## 2. A job, end to end

```mermaid
sequenceDiagram
    participant S as Forge (server)
    participant Q as Queue (forge.run-job)
    participant A as ForgeAgent
    participant R as Runtime (container, root)
    participant P as Child process (as transform)
    participant O as Storage

    S->>Q: RunJob { jobRid, attempt }
    Q->>A: message (a slot is free)
    A->>S: POST jobs/:rid/claim
    S-->>A: job, recipe, pinned inputs, output transactions, job token
    A->>R: docker run -i --rm image  (cpus, memory from recipe.compute)
    R-->>A: stdout: ready
    A->>R: stdin: run { job, recipe, token }
    R->>S: git clone /api/git/workspace.git at recipe.runtime.commit (token)
    Note over R: the checkout stays root's, readable by transform
    R->>P: spawn uv venv + uv sync --frozen (venv in transform's home, /cache)
    R->>S: GET jobs/:rid/input-passes (token)
    S-->>R: presigned GET URLs for the pinned files
    R->>P: spawn python run job.json (URLs, scratch dir, no token)
    P->>O: range GETs (footers, needed column chunks)
    P->>P: transform, rolling Parquet files in /scratch/out
    loop each finished file
        P-->>R: fd 3: file-ready
        R->>S: upload pass, then register the file (token)
        R->>O: PUT the file, while Python writes the next
    end
    P-->>R: exit 0
    R-->>A: stdout: response { status: succeeded }
    A->>R: closes stdin, the runtime exits, --rm deletes the container
    A->>S: POST jobs/:rid/finish
    S->>S: commitBatch: the outputs become new versions
```

The message on the queue never carries the job or a credential: only `{ jobRid, attempt }`. Everything else comes from `claim` — the agent claims the job and the server grants it (scheduled → running, once per attempt) — when the inputs get pinned, and when the token is minted. A credential never waits in Redis.

## 3. Runtimes

### A Nest microservice over stdio

Every process has three pipes: **stdin** (input), **stdout** (output) and **stderr** (logs). Whoever starts a process holds its pipes: what the parent writes into the child's stdin, the child reads; what the child prints, the parent reads.

```mermaid
sequenceDiagram
    participant P as Parent (ForgeAgent, extension or check worker)
    participant R as Child (the runtime)
    P->>R: stdin pipe: child.stdin.write(message), read by process.stdin
    R-->>P: stdout pipe: process.stdout.write(reply), read by child.stdout.on('data')
    Note right of R: stderr: the runtime's own logs
```

So the runtime needs no HTTP server and no port. It's a Nest microservice with a **custom transport** (Nest ships TCP, Redis, NATS, MQTT, RabbitMQ, Kafka and gRPC, and supports custom ones):

- **`Stdio`** (`packages/shared/domain/Stdio/Stdio.ts`) is the base, as `Realtime` is for events over Redis: `Stdio.Request.Base`, `Stdio.Response.Base`, `Stdio.Error`, `Stdio.Event` (`Ready`, `Log` — the transport's own), `Stdio.FromProcess`, `Stdio.PROTOCOL`, and `Stdio.Payload<M>` — a message without its envelope (`type`, `id`, `pattern`): what a handler returns and a caller passes.
- **A domain's calls extend it.** `Forge.Runtime.Run` (`packages/shared/domain/Forge/Runtime.ts`) is `Stdio.Request.Base.extend({ pattern: z.literal("run"), job, recipe })` and `Stdio.Response.Base.extend({ status, failure })` — fields directly on the message, as a domain's events sit on `Realtime.Event.Base`, so no `data` wrapper. A domain's fields never use the envelope's names (`type`, `id`, `pattern`, `event`). Code Workspaces' `describe` and `preview` will extend it the same way. `Forge.Recipe.Runtime` says which runtime a recipe uses; `Forge.Runtime` is what Forge asks of one.
- **`StdioServer`** (`@quarry/shared/server/stdio/stdio-server`), in the runtime: a `CustomTransportStrategy`, given the request schemas the runtime serves (`new StdioServer('code-workspace', [Forge.Runtime.Run.Request])`). It reads stdin a line at a time, parses each line whole against the schema of its pattern (the envelope only says which) before the `@MessagePattern` handler gets the request, and writes the handler's payload as the response — or the error — to stdout. `sendEvent({ event: 'log', stream, line })` writes an event.
- **`StdioClient`** (`…/stdio/stdio-client`), for whoever started the runtime — the ForgeAgent now, the extension and the check worker later: `request(Forge.Runtime.Run, { job, recipe })` sends the payload with the call's pattern and returns the parsed response; `log` events go to a callback. If the runtime exits, everything still waiting fails with its exit code; a line that breaks the protocol kills the runtime and fails what's waiting with the reason, never the caller's own process.

```ts
const app = await NestFactory.createMicroservice(RuntimeModule, {
    strategy: new StdioServer('code-workspace', [Forge.Runtime.Run.Request]),
    logger:   ['error'],                                  // Nest logs below error to stdout
});

@Controller()
export class RuntimeController {
    @MessagePattern('run') run(@Payload() request: Forge.Runtime.Run.Request) { … }   // built: returns Stdio.Payload<Run.Response>
    // later: describe (the transforms), preview, cancel
}
```

One JSON message per line, each with its `type`:

```mermaid
sequenceDiagram
    participant D as ForgeAgent (parent)
    participant R as Runtime (child)
    R-->>D: stdout {"type":"event","event":"ready","runtime":"code-workspace","protocol":1}
    D->>R: stdin {"type":"request","id":1,"pattern":"run","job":{ … },"recipe":{ … }}
    R-->>D: stdout {"type":"event","event":"log","stream":"stdout","line":"…"}
    R-->>D: stdout {"type":"response","id":1,"status":"succeeded","failure":null}
    Note over D,R: a handler that throws answers {"type":"error","id":1,"message":"…"}
```

**`ready` comes first.** The runtime says which runtime it is and which protocol it speaks; the caller refuses anything else (`waitUntilReady`). It's also the "booted" signal: the caller sends nothing before it. The images are pinned to the agent's release (`FORGE_AGENT_RUNTIME_TAG`), so for jobs a mismatch only happens when something is pinned wrong; the IDE's long-lived runtime is where the check really matters.

stdout is only for protocol messages. The runtime's own logs go to stderr (`System.log.useStderr()`), and so does Nest's, at error level only. A closed stdin means stop: the runtime exits, even mid-request.

### Who starts it, and for what

| Caller | Starts it with | Sends | Lifetime |
|---|---|---|---|
| ForgeAgent | `docker run -i --rm <image> runtime` | one `run` | the job's: one job per container |
| IDE (the extension) | spawn, inside the session container | `describe`, `preview` (many), `cancel` | the IDE's; restarted after a crash or a changed environment |
| Check worker | `docker exec -i <container> runtime` | one `describe` (the manifest) | the check run's container |

`describe` replaces `preview.py --list` and `manifest.py`; `preview` replaces `preview.py <name>`; `run` is new.

### Lifetimes: a job container

The runtime is the container's main process, so they live and die together.

```mermaid
sequenceDiagram
    participant D as ForgeAgent
    participant C as Container + runtime
    participant S as Server
    D->>C: docker run -i --rm image runtime
    Note over C: container starts = runtime starts
    C-->>D: ready
    D->>C: run { job, recipe }
    Note over D: renews the lease every 10 s while it waits
    C-->>D: log events
    C-->>D: response { status }
    D->>C: closes stdin
    Note over C: runtime exits, container stops,<br/>--rm deletes it
    D->>S: POST finish
```

- **Normally nothing is killed.** The runtime answers `run`, the ForgeAgent closes its stdin, it exits, and the container ends with it.
- **Killed only when something's wrong:** a cancel (the heartbeat reply says `stop`), a timeout, or a runtime that sent `done` but doesn't exit (killed after a short grace).
- **If the agent restarts mid-job,** the pipe is gone and nobody is listening. The runtime treats a closed stdin as stop; the reaper fails a job with no heartbeat and kills what's left.

The ForgeAgent renews the job's lease every 10 s while the runtime runs — on a timer, not on events, since a transform can compute for minutes without printing — logs its `log` events, and turns the response into `finish`. A runtime that exits, breaks the protocol or never says `ready` fails the job with that reason.

### Inside the code-workspace runtime

The runtime coordinates; Python only runs transforms. Each `preview` or `run` spawns a **child process**, so a crash or out-of-memory doesn't take the runtime down, and edited code is imported fresh.

```mermaid
flowchart TB
    run["run { job, recipe, token }"] --> clone["clone the workspace at recipe.runtime.commit<br/>(runtime, root, with the token)"]
    clone --> sync["uv venv + uv sync --frozen<br/>(as transform: venv in its home, cache in /cache)"]
    sync --> inputs["GET input-passes (token)<br/>presigned URLs"]
    inputs --> jobjson["write job.json<br/>inputs: URLs, outputs: scratch dirs"]
    jobjson --> spawn
    subgraph spawn["spawn as transform: python -m quarry.transforms.run"]
        direction TB
        load["import the pipeline, find the transform"] --> transform["transform reads URLs,<br/>writes /scratch/out/output/part-N.parquet"]
    end
    spawn -- "file-ready, per file" --> upload["upload + register each file (token)"]
    spawn -- "exit 0 or 1" --> done["response { status }"]
```

Everything that needs the token — cloning, input and upload passes — is the runtime's, as root. Everything that runs the workspace's code or its dependencies — `uv sync` (a package's build can run code), the transform — is a child spawned as `transform`.

**No file changes hands.** The runtime keeps only the capabilities to switch users, so it can't `chown`. It doesn't need to: git writes the checkout readable by everyone, and `transform` only reads it; the venv lives in `transform`'s home (`UV_PROJECT_ENVIRONMENT`), so nothing is written into the checkout; and `/cache` is `transform`'s in the image, which a new cache volume copies, ownership included.

**The token reaches git only.** The clone gets it through `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_0` / `GIT_CONFIG_VALUE_0` in its own environment (`http.extraHeader: Authorization: Bearer …`) — not in its arguments, where `ps` shows them, and not in a config file in the checkout.

**The recipe's RIDs are trusted** (decided 2026-10-29). A job doesn't re-check that the transform's refs still point at the recipe's datasets: the check resolved them when it published, and the job reads and writes the RIDs it was given. A ref renamed since then takes effect at the next push.

### Environment

The code-workspace runtime installs the workspace's `uv.lock` when the job starts (`uv sync --frozen`), with its uv cache in `/cache` (`UV_CACHE_DIR=/cache/uv`) — the code-workspace runtime's cache **volume**: a folder Docker keeps on the host, outside any container, that survives the containers that mount it. Every code-workspace job container on a machine mounts the same one:

```mermaid
flowchart LR
    subgraph machine["Agent machine"]
        cache[("volume quarry-cache-code-workspace<br/>persists: polars, duckdb, …<br/>downloaded once")]
        job1["job 1 container<br/>created → ran → deleted<br/>uv sync ~10 s, fills the cache"]
        job2["job 2 container<br/>created → ran → deleted<br/>uv sync 0.1 s"]
        job3["job 3 container<br/>…<br/>uv sync 0.1 s"]
    end
    job1 -- "writes" --> cache
    cache -- "reads" --> job2
    cache -- "reads" --> job3
```

Measured 2026-10-29 in the IDE image (`quarry/code-workspace-ide:dev`) with the template's dependencies: about 10–11 s with an empty cache, 0.1 s warm (also on a volume); a bare container starts and stops in 0.2 s. The packages installed in the image don't help `uv sync` — it installs the locked versions into the venv anyway.

**Known risk, accepted for now:** the cache is writable by every job's code, so a malicious transform could tamper with cached packages that another workspace's job then installs and runs. Fixes when it matters: a cache volume per workspace, or a shared cache filled by a trusted step and mounted read-only in jobs.

## 4. Delegates: who holds which token

A runtime **carries** permissions; it can't **enforce** them. It runs in the same container as the user's code, so anything it holds, that code could read. Only the server enforces.

| Where | Token | Narrowed to |
|---|---|---|
| Build job | the **job token**, minted at `claim` (`SessionTokens.mint`, `via: 'forge-job'`) | the **build's starter** — a full user token for now, like a check run's; narrowing it to the job's inputs and outputs needs a scope claim the verifier enforces (later) |
| Preview (IDE) | the session's token | the user |
| Check run | the run's token | the pusher |

In a job, **Python never gets the token**. The runtime holds it and gives Python only presigned URLs for its own pinned inputs and a local folder to write to. **Python runs as its own OS user** (decided 2026-10-29, built in phase 1). A process can read everything of another process of the same user — its environment (`/proc/<pid>/environ`), its memory, its files — so with one user, a transform could read the token straight out of the runtime. Every Python child is spawned as `transform` (uid 1001, `uid`/`gid` on `spawn`).

Switching users takes the right to switch, so the runtime runs as **root inside the container, with every capability dropped except switching users**: the ForgeAgent starts job containers with `--cap-drop ALL --cap-add SETUID --cap-add SETGID --security-opt no-new-privileges`. Switching from root to `transform` drops even those, so the child has no capabilities at all, can't switch back, and can't read the runtime's process. The child gets only what it's handed:

- **A clean environment.** The child is spawned with an explicit `env` (`PATH`, `HOME`, `UV_CACHE_DIR`, the job's settings), never the runtime's own — nothing the runtime knows leaks through variables.
- **No access to the runtime's files.** The runtime's working files and `job.json` drafts are readable by `runtime` only; the child gets its own job file and scratch directory, owned by `transform`.
- **No capabilities.** `transform` isn't root and holds none, so it can't switch users or read other processes.

## 5. Reading inputs

Nothing is mounted or copied into the container up front. The runtime asks the server for **input passes** — presigned URLs, short-lived, for exactly the pinned files, like a visitor's pass that opens certain doors for a day — and the engines read Parquet straight from storage over HTTP. Writing works the same way with **upload passes** (§7).

### What a Parquet file looks like

```mermaid
flowchart TB
    subgraph file["orders-part-0001.parquet (say 1 GB)"]
        direction TB
        subgraph rg0["row group 0 (~1M rows)"]
            direction LR
            c1["column chunk: order_id<br/>pages, compressed"]
            c2["column chunk: date<br/>pages, compressed"]
            c3["column chunk: amount<br/>pages, compressed"]
        end
        subgraph rg1["row group 1"]
            more["…"]
        end
        footer["<b>footer</b><br/>schema + for every row group and column:<br/>byte offset, size, min/max, null count"]
        rg0 ~~~ rg1 ~~~ footer
    end
```

The footer is a table of contents. A reader fetches it first (one range request at the end of the file), then only the byte ranges it needs. Presigned URLs serve byte ranges like any object storage.

### From the job to a Polars frame

```mermaid
sequenceDiagram
    participant R as Runtime (Nest)
    participant S as Server
    participant P as Python
    participant O as Storage

    Note over R: run { job, token } arrives
    R->>S: GET jobs/:rid/input-passes (token)
    Note over S: token ok, the pinned files of each input,<br/>signed as presigned GET URLs (no data moved)
    S-->>R: { clean: { sequence, schema, urls } }
    R->>R: write job.json (URLs, output dirs)
    R->>P: spawn python (no token in its env)
    Note over P: TransformInput("clean", urls)<br/>.polars(lazy=True) = pl.scan_parquet(urls)<br/>nothing read yet
    Note over P: the transform builds a query,<br/>then collect or sink_parquet runs it
    P->>O: GET footer (range request)
    O-->>P: last ~64 KB: schema, offsets, min/max
    P->>O: GET date + amount chunks of the needed row groups
    O-->>P: only those bytes
```

- `TransformInput` holds URLs instead of a local directory. Polars `pl.scan_parquet(urls)` and DuckDB `read_parquet([...])` read `https://` natively, with range requests in parallel; pyarrow and pandas go through `fsspec`'s HTTP filesystem.
- **Columns:** a transform using 5 of 50 columns fetches only those 5 (Parquet is columnar).
- **Row groups:** a filter like `date >= '2026-10-01'` skips whole row groups by their min/max.
- So "20 GB of data" is often a few GB actually read — when the transform reads lazily. Eager `.polars()`, `.arrow()` and `.to_pandas()` read everything.
- The URLs are signed for the job's longest allowed run, and only for those files.

### A chain of jobs

```mermaid
flowchart LR
    raw[("raw<br/>20 GB")] --> A["job A: clean"] --> clean[("clean<br/>18 GB")] --> B["job B: join"] --> joined[("joined")] --> C["job C: aggregate"] --> summary[("summary<br/>5 MB")]
```

Every job reads its own inputs from storage — the previous job's output, not the original. Nothing is shared between containers; storage is. This is the industry's model too (storage apart from compute: Databricks, Snowflake, Foundry). What avoids re-reading big data later is **incremental transforms** (process only what's new since the last build; transactions already know what was appended), not copying data around.

## 6. Streaming: 20 GB in a 4 GB container

A lazy query is a plan, not data:

```python
orders = clean.polars(lazy=True)                              # plan: scan
result = (orders.filter(pl.col("date") >= "2026-10-01")       # plan: filter
                .group_by("customer").agg(pl.col("amount").sum()))
out.write_table(result)                                       # → runs, streaming
```

Run by the streaming engine (`collect(engine="streaming")`, or `sink_parquet`, which always streams):

```mermaid
flowchart LR
    batches["row group batches<br/>batch 1, batch 2, …"] --> filter["filter"] --> agg["partial sums per customer<br/>(hash table)"] --> finish["end of input"] --> write["write"]
    note["each batch: read, filter, add to the hash table, drop it<br/>memory ≈ a few batches + the hash table, not 20 GB"]
    agg -.- note
```

| Work | Streams? | Typical bottleneck |
|---|---|---|
| filter, select, `with_columns` | yes | I/O: reading from storage |
| group-by aggregations | yes — memory is the number of groups | CPU, then memory |
| joins with one small side | yes | CPU |
| sorts, joins of two big tables | spill to disk (DuckDB; Polars increasingly) | memory, then disk |
| eager `collect()`, `.to_pandas()`, Python row loops | no — everything in memory | memory (out-of-memory), CPU (loops are 10–100× slower) |
| decoding Parquet | — | CPU, about 1–2 GB/s per core |

Rough speeds: object storage does about 100 MB/s per connection, 1–10 GB/s with the parallel reads engines make; on the same machine or LAN as SeaweedFS, faster. Reading 20 GB is seconds to a minute; what decides 30 seconds against 30 minutes (or out of memory) is how the transform is written and `recipe.compute.memoryGb`. The template and docs should show lazy as the normal way.

## 7. Writing outputs

Outputs are written as **several files**, and each one is uploaded as soon as Python closes it, while Python writes the next. So the upload overlaps the transform: when Python exits, only the last file is left to upload, and the scratch disk holds a few files, not the whole output.

```mermaid
sequenceDiagram
    participant P as Python (writer)
    participant R as Runtime (uploader)
    participant S as Server
    participant O as Storage
    participant A as ForgeAgent

    P->>P: write part-0 (rolls at ~256 MB)
    P-->>R: file-ready part-0
    par upload part-0
        R->>S: POST jobs/:rid/outputs/:ds/upload-passes (token)
        S-->>R: presigned PUT
        R->>O: PUT part-0
        R->>S: POST jobs/:rid/outputs/:ds/files { key, size, schema }
    and keep writing
        P->>P: write part-1
    end
    P-->>R: file-ready part-1
    par upload part-1
        R->>O: PUT part-1 (same three calls)
    and keep writing
        P->>P: write part-2
    end
    P-->>R: exit 0 (part-2 was the last)
    R->>O: PUT part-2 (same three calls)
    R-->>A: done { succeeded }
    A->>S: POST jobs/:rid/finish
    Note over S: commitBatch: the outputs become new versions
```

- **Rolling files.** `write_table` pulls the result in batches (a Polars LazyFrame's batches, DuckDB's `fetch_record_batch`, or Arrow directly) and writes them with pyarrow's `ParquetWriter`, starting a new file every ~256 MB. It still streams: the whole output is never in memory. A DataFrame or Arrow table that's already in memory is split the same way.
- **A file is announced only when it's complete.** Python writes `part-N.parquet.tmp`, closes it, renames it to `part-N.parquet`, then writes `{"type":"event","event":"file-ready","path":…}` to the runtime on **file descriptor 3** — a pipe of its own, because Python's stdout and stderr carry the transform's own prints (relayed as `log` events). The same line protocol as ForgeAgent ↔ runtime, one level down. A Parquet file is only valid once its footer is written, so a half-written file is never uploaded.
- **The runtime uploads, not Python** — uploading needs the token, and retries are the runtime's problem, not the user's. It uploads a few files in parallel, and registers each on the open transaction once it's stored.
- **Backpressure.** If uploads fall behind, Python waits once N finished files are still waiting to upload. The scratch disk only ever needs a few files' worth of room.
- **The schema** is read from the Parquet files and mapped to Catalog's column types (`preview.py`'s `column_type` already does this).
- Nothing is visible until `finish` commits. A crash leaves the uploaded files on an open transaction; the abort cleans them up.
- **Not chosen: streaming bytes straight into storage** (the Parquet writer feeding an S3 multipart upload, no files on disk). Parquet allows it — it's written front to back, footer last — but every part needs its own presigned URL from the runtime, retrying a failed part mid-stream is fiddly, and it only saves the scratch disk. Rolling files get almost all of the time back with per-file retries.

## 8. What has to be built

In phases, each small enough to read and review on its own (decided 2026-10-29):

| Phase | What | Proves |
|---|---|---|
| **1. Plumbing** | the `Forge.Runtime` contract and the stdio transport; the code-workspace runtime and its compute image; the ForgeAgent starting it (`runtimeImages`, limits, `/cache`), `run` over stdin, events → heartbeats, `done` → `finish`, kill on stop. `run` spawns Python as `transform`, which only imports `quarry.transforms` and exits. No token, no code, no data | a job reaches a runtime in its own container and comes back |
| **2. The code** — built 2026-10-29 | the job token at `claim`; the runtime clones the commit, `uv sync --frozen` with `/cache`, imports the pipeline and finds the transform | the right code runs in the right environment |
| **3. Reading** | presigning; input passes; `TransformInput` from URLs; lazy reads | a transform reads its pinned inputs |
| **4. Writing** | upload passes; rolling files and `file-ready`; registering files; `commitBatch` on `finish` | a build writes new versions |
| **5. Callers** | the extension's preview and the check worker's manifest go through the runtime | one path for preview, checks and builds |

The items below say what each part needs; the table says when.

**Phase 1, as built:** `Stdio` in `packages/shared/domain/Stdio/Stdio.ts` and `Forge.Runtime` in `packages/shared/domain/Forge/Runtime.ts`; `StdioServer` and `StdioClient` in `packages/shared/server/stdio/`; the runtime in `packages/code-workspace-runtime/` (`main.ts`, `runtime.module.ts`, `runtime.controller.ts`; `npm run build` bundles it into `dist/runtime.js`); its image in `docker/code-workspace-runtime/` (`npm run build:code-workspace-runtime` → `quarry/code-workspace-runtime:dev`); the ForgeAgent's `JobContainers` (`docker run` and `docker kill`) and `RunJobProcessor` in `packages/forge-agent/src/`. Verified end to end by `test/e2e/forge-agent.e2e.test.ts` (a real ForgeAgent, real containers). `finish` still aborts the outputs: nothing is written until phase 4.

**Phase 2, as built:** `claim` returns `token`, minted by `ForgeAgentService.claimJob` for the build's `createdBy`; the agent passes it in `run`, and starts job containers with `QUARRY_SERVER_URL` (`FORGE_AGENT_JOB_SERVER_URL`, default `http://host.docker.internal:4000`) and `--add-host host.docker.internal:host-gateway`. The runtime's `run` is a list of steps, each a child process whose lines are relayed as `log` events: clone and check out (root, the token in git's environment), `uv venv --system-site-packages` and `uv sync --frozen --no-dev` (as `transform`), then `python -m quarry.transforms.run <transform>` (`packages/transforms-python/src/quarry/transforms/run.py`: imports the pipeline at the commit and finds the transform). A failed step fails the job as `<step> failed with exit code N`. The image adds git and CA certificates. Tests: the e2e test builds from a real workspace commit (and fails a transform the commit doesn't have); `test/forge/agent-api` checks the token acts as the build's starter; `tests/test_run.py` covers `run.py`.

**Server**

1. Presigning in `FileStorage` (`infra/file-storage.ts`): GET, PUT and multipart PUT URLs (SeaweedFS's S3 API supports them).
2. The job token, minted at `claim`: scoped to the job's attempt, its pinned inputs (read) and outputs (write). **Phase 2**, decided 2026-10-29 — phase 1 runs without one.
3. Pinning inputs at `claim` (`job.inputs`).
4. `GET jobs/:rid/input-passes` → presigned URLs; `POST jobs/:rid/outputs/:ds/upload-passes` → upload URLs; `POST jobs/:rid/outputs/:ds/files` → registers files on the open transaction. All gated by the job token.
5. `catalog.transaction.commitBatch`, and `finish` committing on success instead of aborting.

**Shared**

6. `Stdio` and `Forge.Runtime`: the message contract — built with `Forge.Runtime.Run` and the events `Stdio.Event.Ready` and `Stdio.Event.Log`; `describe`, `preview` and `cancel` come with their callers.
7. The stdio transport: `StdioServer` (custom transport strategy) and `StdioClient`.

**Code-workspace runtime**

8. The Nest runtime (`describe`, `preview`, `run`, `cancel`), spawning Python per operation, and uploading output files as Python announces them.
9. `quarry.transforms`: `TransformInput` from URLs; `write_table` writing rolling files and announcing each (`file-ready`); a `run` entry point reading `job.json`; `describe` and `preview` behind the runtime.
10. **A separate compute image**, `quarry/code-workspace-runtime` — not the IDE's, which is `quarry/code-workspace-ide` (decided 2026-10-29): compute scales on its own and needs no editor. The runtime, Node, Python, uv, git; `/cache` from the agent.

**ForgeAgent**

11. The ForgeAgent's runtime protocol, the same for every runtime: `runtimeImages`, `docker run -i` with limits and the type's `/cache` volume, the stdio client, heartbeats from events, kill on stop, `done` → `finish`.

**Callers moving to the runtime**

12. The extension's preview and the check worker's manifest go through the runtime instead of `preview.py` and `manifest.py`.

### Phase 3: reading the inputs — plan (2026-10-29)

**Goal:** a transform reads its pinned inputs from storage, by parameter name, with only signed URLs in Python. Nothing is written yet.

```mermaid
sequenceDiagram
    participant A as ForgeAgent
    participant S as Server
    participant R as Runtime (root)
    participant P as Python (transform)
    participant O as Storage

    A->>S: POST jobs/:rid/claim
    Note over S: pins each input: its latest committed transaction on main → job.inputs
    S-->>A: job (with inputs), recipe, token
    A->>R: run { job, recipe, token }
    Note over R: clone, uv sync (phase 2)
    R->>S: GET /api/forge/jobs/:rid/input-passes (token)
    Note over S: job running and read on each input, then each pinned version's files, presigned for the job host
    S-->>R: { datasetRid: { sequence, schema, files: [{ url, bytes }] } }
    R->>P: job.json: inputs by parameter (recipe.runtime.inputs) → their URLs
    P->>O: range GETs, only the needed columns and row groups
    P-->>R: exit 0
```

**1. The parameter mapping, in the recipe.** `Forge.Recipe.Runtime`'s `code-workspace` member gains `inputs: Record<parameter, Dataset.Rid>` and `outputs: Record<parameter, Dataset.Rid>`. `CheckPublisher` already resolves each ref by its parameter name; it keeps the names instead of dropping them. `inputDatasetRids` / `outputDatasetRids` stay the sets Forge plans and gates with. The runtime looks nothing up by path (the RIDs are trusted).

**2. Pinning, at `claim`.** In the claim's transaction, each input's latest committed transaction on the build's branch (main) goes into `job.inputs` (`Record<Dataset.Rid, Transaction.Rid>`, which exists and is unfilled). Build creation already refuses an input with no data. *Until phase 4*, an input built earlier in the same build pins its old version, since outputs aren't committed yet.

**3. Presigning, in Catalog.** `FileStorage` gains `presignGet(key)` (`@aws-sdk/s3-request-presigner`, new dependency). The URL's host is part of its signature, and `S3_ENDPOINT` (`localhost:9000`) means nothing inside a container, so presigning uses its own endpoint: **`STORAGE_ENDPOINT`** — storage as job containers reach it (`http://host.docker.internal:9000` locally, the real store's address in production). `CatalogStorageService.getReadPasses(principal, datasetRid, transactionRid)`: `@SecurityGate('read')`, `@Audit('read', { op: 'read-passes' })`, resolves that version's files (`resolveView` at the transaction's sequence) and presigns each. URLs live for the job's longest run (`QUARRY_READ_PASS_TTL`, default 12 h, as the token).

**4. Input passes, in Forge.** `GET /api/forge/jobs/:rid/input-passes`, called by the runtime with the job token: the job must be running; for each of `job.inputs`, `catalog.storage.getReadPasses(...)`. Response by dataset RID: `{ sequence, schema, files: [{ url, bytes }] }`. One call per job.

**5. The runtime.** After `uv sync`: one request for the input passes, then `job.json` in `transform`'s home — `{ "transform": name, "inputs": { parameter: { "rid", "sequence", "files": [url, …] } } }` — and `python -m quarry.transforms.run job.json`.

**6. `quarry.transforms`.** `TransformInput(rid, sequence, files)` — a list of files, URLs or local paths alike (preview passes its downloaded sample as a one-item list). `polars(lazy)` is `pl.scan_parquet(files)`; `arrow()` and `pandas()` go through Polars (no new Python dependencies); the DuckDB context reads `read_parquet([files])`. `path()` (a local directory) is replaced by `files()`. `run.py` reads `job.json`, builds the inputs by parameter, and calls the transform; its outputs get a `TransformOutput` that does nothing yet (phase 4 writes them).

**7. Tests.** Server: `claim` pins each input's latest committed transaction; input passes need the job running and read on the input; a pass is a working URL (fetch it, get the file's bytes). Python: `TransformInput` over several files. E2E: a real dataset (uploaded CSV, so its files exist), a transform that reads it lazily and prints its row count; the agent's log shows it.

**Checked first (spike, 2026-10-29):** two Parquet files uploaded to the local store, GET URLs presigned for `host.docker.internal:9000`, read inside the runtime image as one list — no options needed, plain `http://` and query strings included. Polars `scan_parquet(urls)` lazy with a filter and two columns across both files: the right rows; count, `read_parquet`, `.to_arrow()`, `.to_pandas()`: all rows. DuckDB `read_parquet([...])`: right count and sum; a view over the list as a SQL literal, then a filter: right rows (a view can't take the list as a prepared parameter — DDL isn't preparable — so `DuckDbContext` keeps writing it as a literal). Not measured yet: how many bytes a lazy read fetches (the pushdown), on a big file.

**Decided (2026-10-29):** `STORAGE_ENDPOINT`; presigning in Catalog, the job-level endpoint in Forge; `TransformInput.files()` replaces `path()`.

## 9. Open questions

- **Narrowing the job token:** it's the build starter's full token for 12 h (`SessionTokens`). Narrowing it — this job's workspace, inputs and outputs — needs a scope claim and the verifier and guards enforcing it; renewing it for jobs longer than 12 h needs a way too (the heartbeat could).
- **Presigned URL lifetime** against the longest job; re-fetching URLs mid-job if they expire.
- **Preview inputs:** keep downloading samples, or sample to storage and hand URLs over, so preview and run read the same way.
