# The Code Workspaces IDE image (docs/design/transforms.md §6–7): what a session
# runs — VS Code in the browser (openvscode-server), Python, uv, git — with
# quarry.transforms and its engines installed system-wide. A workspace's own
# .venv sees them (--system-site-packages), so its lock lists only what it adds.
#
#   npm run build:code-workspace-ide     (bundles the runtime and packages the Quarry extension first, then builds this)
#
# Versions are pinned to releases at least two weeks old.

FROM ghcr.io/astral-sh/uv:0.9.11 AS uv

FROM python:3.12.14-slim-bookworm

ARG OPENVSCODE_VERSION=1.109.5
ARG PYTHON_EXTENSION=ms-python.python@2026.4.0
ARG BASEDPYRIGHT_EXTENSION=detachhead.basedpyright@1.40.2
ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/

# VS Code in the browser.
RUN case "${TARGETARCH}" in amd64) arch=x64 ;; arm64) arch=arm64 ;; *) echo "unsupported: ${TARGETARCH}" && exit 1 ;; esac \
    && curl -fsSL "https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-v${OPENVSCODE_VERSION}/openvscode-server-v${OPENVSCODE_VERSION}-linux-${arch}.tar.gz" \
        | tar -xz -C /opt \
    && mv "/opt/openvscode-server-v${OPENVSCODE_VERSION}-linux-${arch}" /opt/openvscode-server

# quarry.transforms and the engines, at its lock's versions.
COPY packages/transforms-python /opt/quarry/transforms-python
RUN cd /opt/quarry/transforms-python \
    && uv export --frozen --no-dev --extra pandas --no-emit-project --output-file /tmp/requirements.txt \
    && uv pip install --system --no-cache -r /tmp/requirements.txt \
    && uv pip install --system --no-cache --no-deps /opt/quarry/transforms-python \
    && rm /tmp/requirements.txt

RUN useradd --create-home --uid 1000 quarry \
    && mkdir -p /workspace \
    && chown quarry:quarry /workspace

COPY docker/code-workspace-ide/bin/ /usr/local/bin/

# The code-workspace runtime (packages/code-workspace-runtime, bundled before this build): the Quarry extension
# runs it with the extension host's own Node, for previews and the transform list.
COPY packages/code-workspace-runtime/dist/runtime.js /opt/quarry/runtime/runtime.js

# Default settings, at every scope: the browser keeps user settings itself (IndexedDB), so a server-side
# settings file can't set application ones — product.json's configurationDefaults can.
COPY docker/code-workspace-ide/configuration-defaults.json /tmp/configuration-defaults.json
RUN python3 -c "import json; p='/opt/openvscode-server/product.json'; product=json.load(open(p)); product['configurationDefaults']=json.load(open('/tmp/configuration-defaults.json')); json.dump(product, open(p, 'w'), indent=2)" \
    && rm /tmp/configuration-defaults.json

USER quarry
WORKDIR /workspace

# The Quarry extension (packages/code-workspace-extension), packaged before this build.
COPY --chown=quarry:quarry packages/code-workspace-extension/dist/quarry-code-workspace.vsix /tmp/quarry.vsix

RUN /opt/openvscode-server/bin/openvscode-server \
        --install-extension "${PYTHON_EXTENSION}" \
        --install-extension "${BASEDPYRIGHT_EXTENSION}" \
        --install-extension /tmp/quarry.vsix \
    && rm /tmp/quarry.vsix

# The session's uv cache lives on its volume, so re-syncing after a restart is fast.
ENV UV_CACHE_DIR=/workspace/.cache/uv \
    UV_LINK_MODE=copy

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["quarry-session-ide"]
