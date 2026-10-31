# Sessions

A **session** is one user's container on one workspace — the computer behind their open IDE. Only the code workspace worker knows sessions: in memory (`SessionManager`) and on their containers' Docker labels. Nothing about them is in Postgres.

| | |
|---|---|
| Identity | `Session.Key` = `<workspace rid>\|<user rid>` (`code-workspace-worker/src/domain/Session.ts`) |
| Container | `quarry-code-workspace-session-<workspace uuid>-<user uuid>`, from `CODE_WORKSPACE_IDE_IMAGE` |
| Volume | same name, mounted at `/workspace` — the working copy (`/workspace/repo`) and uv's cache survive stops |
| Secret | 48 hex characters (`Session.createSecret`) — the IDE's path `/s/<secret>/` and VS Code's connection token |
| Port | VS Code's 3000, published on `127.0.0.1:<random>` only |
| Limits | `CODE_WORKSPACE_SESSION_MEMORY` (4g), `CODE_WORKSPACE_SESSION_CPUS` (2) |
| Labels | `quarry.code-workspace-session=true`, `.workspace`, `.user`, `.secret` (`Session.toLabels`) |

## Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Starting: first open<br/>docker run
    Starting --> Running: VS Code answers,<br/>setup succeeds
    Running --> Running: open again (setup re-runs,<br/>fresh token), IDE proxy traffic
    Running --> Stopped: no activity for<br/>CODE_WORKSPACE_SESSION_IDLE_MINUTES (30)<br/>docker stop
    Stopped --> Running: next open<br/>docker start, setup
    Running --> Running: worker restarts —<br/>restored from labels
    Running --> Running: Restart (IDE menu) —<br/>docker rm, docker run, setup
    Stopped --> Running: Restart (IDE menu) —<br/>docker rm, docker run, setup
    Stopped --> Stopped: worker restarts —<br/>restored as stopped
```

A stopped session keeps its container and volume, so uncommitted files are there on the next open. Only a Restart removes a container (below); nothing removes volumes yet (trashing a workspace doesn't either).

## Opening one

`POST /api/code-workspaces/:rid/session` → the IDE's URL. The page calls it through `CodeWorkspaceSDK.query.session(rid)` once it has rendered; the iframe loads the URL.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant S as Server (CodeWorkspaceService)
    participant W as Worker (SessionController → SessionManager)
    participant D as Docker
    participant C as Session container

    B->>S: POST /api/code-workspaces/:rid/session
    Note over S: @RequireUserPrincipal → @SecurityGate('read') → get (404 if trashed)
    S->>W: POST {worker}/sessions/open { workspaceRid, userRid }<br/>(service token, CodeWorkspaceWorkerClient, ≤ 5 min)
    W->>S: POST /api/internal/code-workspaces/session-credentials (service token)
    Note over S: as a delegate of the user: get + assert read,<br/>then mint a 12h token
    S-->>W: { token, user: { name, email } }
    alt no session yet
        W->>D: docker run (labels, secret env, volume, 127.0.0.1 port)
        D->>C: quarry-session-ide → openvscode-server --server-base-path /s/{secret}
    else stopped
        W->>D: docker start
    end
    W->>C: wait until VS Code answers on /s/{secret}/
    W->>D: docker exec quarry-session-setup (token, URLs, author — by env name)
    Note over C: ~/.gitconfig: Authorization header for the git URL<br/>~/.quarry/session.json (600): token, workspaceRid, serverUrl, appUrl<br/>first open: git clone, uv venv --system-site-packages<br/>every open: uv sync
    W-->>S: { url: {ideProxy}/s/{secret}/?tkn={secret} }
    S-->>B: { url }
    B->>B: the iframe loads url — see ide-proxy.md
```

Two opens of the same session at once share one in-flight open (`SessionManager.opening`). The worker down → the open fails at once with a 503 ("isn't reachable — is it running?"), not after a wait. Reopening a running session is ~0.1 s: no container work, only setup (which refreshes the token).

## Restarting one

`POST /api/code-workspaces/:rid/session/restart` → the IDE's new URL — the page's **IDE → Restart**. It replaces the session's container with a fresh one from the current `CODE_WORKSPACE_IDE_IMAGE`, the way to pick up a rebuilt IDE image (the Quarry extension and its themes included) or to recover a wedged container. Same checks as an open (read on the workspace), then the worker's `POST /sessions/restart`:

1. Waits for any open in flight; opens arriving during the restart join it (`SessionManager.opening`).
2. `docker rm --force` the container and forgets the session. The volume stays — the working copy, uncommitted files and uv's cache.
3. Opens as for a first open: `docker run` with a new secret (so a new URL), then setup — no clone, the repository is already on the volume; `uv sync` only.

The page shows "Restarting your session" in place of the editor meanwhile, then loads the new URL (the session query takes it).

## The credential

Everything in the container that calls Quarry acts **as the user**, with a token the server mints for the session:

```mermaid
flowchart LR
    W["Worker<br/>(each open, each preview)"] -- "service token<br/>{ workspaceRid, userRid }" --> I["/api/internal/code-workspaces/<br/>session-credentials"]
    I --> A{"delegate of the user:<br/>workspace live?<br/>read on it?"}
    A -- no --> X["404 / 403 — nothing minted"]
    A -- yes --> M["SessionTokens.mint<br/>HS256, GOTRUE_JWT_SECRET,<br/>sub = user, aud = authenticated,<br/>quarry_via, exp 12h"]
    M --> W
    W -- "setup (open)" --> G["~/.gitconfig extraHeader<br/>~/.quarry/session.json"]
    W -- "exec env (preview)" --> P["the preview process only"]
```

Lifetimes: each token works 12 hours. Git's and the extension's copy is refreshed on every open (including Reconnect); a preview's copy is minted for that one run. See [authorization.md](authorization.md) for what the token can reach.

## After a worker restart

On boot the worker lists every container labelled `quarry.code-workspace-session` and rebuilds each session through `Session.fromLabels` (schema-validated; a container with bad labels is skipped): running ones get their current host port and keep serving, stopped ones start on their next open. Every restored session's idle clock starts at the restart.

## Idle stop

Every minute, any running session whose `lastActivityAt` is older than the idle limit is stopped. Activity is: an open, and **every IDE proxy request or WebSocket frame from the browser** (`SessionManager.touchBySecret`) — so an open IDE tab keeps its session alive; a closed one lets it stop.
