# The IDE gateway

The browser never talks to a session container directly — containers publish VS Code on `127.0.0.1` only. The code workspace worker's **gateway** (`code-workspace-worker/src/gateway.ts`, on `CODE_WORKSPACE_WORKER_PORT`, 4103) forwards each session's traffic.

It lives in the worker, not the API server, because Nest's WebSocket adapter in the server destroys every upgrade that isn't for its own paths (`/socket`) — VS Code's WebSockets couldn't pass through it. In production a reverse proxy would route a path (or host) to the worker.

## The URL

```
http://127.0.0.1:4103/s/<secret>/?tkn=<secret>
         gateway      └── path ──┘ └─ VS Code's connection token ─┘
```

- `/s/<secret>/` — VS Code runs with `--server-base-path /s/<secret>`, so it serves everything (pages, assets, WebSockets) under that path. The gateway forwards paths **unchanged**.
- `?tkn=<secret>` — VS Code's own check (`--connection-token`). The first request sets a cookie and redirects; after that the cookie carries it.

So the **secret is a capability**: whoever has the URL reaches that IDE, and it's handed out only by `POST /api/code-workspaces/:rid/session`, after Gatekeeper's `read` check. The gateway itself checks no Quarry login — it can't: an iframe can't send a Bearer header.

## A request

```mermaid
flowchart TD
    R["Request on :4103"] --> P{"path matches<br/>^/s/([0-9a-f]{48})(/|$)?"}
    P -- no --> N["next() — e.g. GET /health"]
    P -- yes --> T["SessionManager.touchBySecret(secret)<br/>• Session.Secret.safeParse<br/>• bySecret lookup<br/>• running? (port set)<br/>• lastActivityAt = now"]
    T -- "unknown or stopped" --> E["404 'No such session, or it has stopped'"]
    T -- "port" --> U{"WebSocket upgrade?"}
    U -- no --> H["proxyRequest: http.request to 127.0.0.1:port,<br/>same method, path, headers,<br/>stream body both ways,<br/>upstream error → 502"]
    U -- yes --> W["proxyUpgrade: net.connect to 127.0.0.1:port,<br/>replay request line + raw headers + head,<br/>then pipe socket ⇄ upstream,<br/>each browser frame → touch (activity)"]
```

```mermaid
sequenceDiagram
    participant B as Browser (iframe)
    participant G as Gateway :4103
    participant M as SessionManager
    participant V as VS Code (container, 127.0.0.1:port)

    B->>G: GET /s/{secret}/?tkn={secret}
    G->>M: touchBySecret(secret)
    M-->>G: { port }
    G->>V: GET /s/{secret}/?tkn=…
    V-->>G: 302 + Set-Cookie (token)
    G-->>B: 302
    B->>G: GET /s/{secret}/ (cookie) → workbench HTML, JS, CSS
    G->>V: (forwarded, unchanged)
    B->>G: Upgrade: websocket /s/{secret}/… (cookie)
    G->>M: touchBySecret
    G->>V: TCP connect, replay the upgrade request
    V-->>B: 101 Switching Protocols (through the pipe)
    loop editing
        B-->>V: frames (each one counts as activity)
        V-->>B: frames
    end
```

## Notes

- **Body parsing is off** in the worker (`NestFactory.create(…, { bodyParser: false })`), so request bodies stream through untouched.
- **Host and Origin are forwarded as sent.** VS Code sees the browser's own origin (`127.0.0.1:4103`) — the iframe is cross-origin to Quarry's page (`127.0.0.1:5173`), which is why the page can't reach into the editor (see [extension.md](extension.md)).
- **A stopped session's URL 404s.** The page's Reconnect re-runs the open (starting it again) and reloads the iframe with the returned URL — the same URL, since a session keeps its secret for the container's life.
- **One worker.** Sessions live in that worker's memory; several workers would need routing (sticky by session, or shared state). Not built.
