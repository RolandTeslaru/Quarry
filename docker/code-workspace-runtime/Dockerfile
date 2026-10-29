# The Code Workspaces runtime image (docs/design/forge-runtimes.md): a Forge job container. The runtime
# (packages/code-workspace-runtime, bundled into one file) is its main process and talks to the ForgeAgent
# over stdin and stdout. It runs as root, which the ForgeAgent strips down to switching users
# (--cap-drop ALL --cap-add SETUID --cap-add SETGID), and spawns every Python process as `transform`.
#
#   npm run build:code-workspace-runtime     (bundles the runtime first, then builds this)
#
# Versions are pinned to releases at least two weeks old.

FROM node:22.23.1-bookworm-slim AS node

FROM ghcr.io/astral-sh/uv:0.9.11 AS uv

FROM python:3.12.14-slim-bookworm

# git clones the workspace; ca-certificates lets git and uv verify HTTPS servers (PyPI).
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=uv /uv /uvx /usr/local/bin/

# quarry.transforms and the engines, at its lock's versions.
COPY packages/transforms-python /opt/quarry/transforms-python
RUN cd /opt/quarry/transforms-python \
    && uv export --frozen --no-dev --extra pandas --no-emit-project --output-file /tmp/requirements.txt \
    && uv pip install --system --no-cache -r /tmp/requirements.txt \
    && uv pip install --system --no-cache --no-deps /opt/quarry/transforms-python \
    && rm /tmp/requirements.txt

# What transforms run as (the runtime's TRANSFORM_USER). /cache is theirs: a new cache volume takes this
# folder's ownership, so uv can fill it. /work holds the checkout, root's.
RUN groupadd --gid 1001 transform \
    && useradd --uid 1001 --gid 1001 --create-home --home-dir /home/transform transform \
    && mkdir /work /cache \
    && chown transform:transform /cache

COPY packages/code-workspace-runtime/dist/runtime.js /opt/quarry/runtime/runtime.js

ENTRYPOINT ["tini", "--", "node", "/opt/quarry/runtime/runtime.js"]
