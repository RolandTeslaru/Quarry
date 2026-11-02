# The Data Connection runtime image (docs/design/forge-runtimes.md): a Forge job container. The runtime
# (applications/data-connection/runtime, bundled into one file) is its main process and talks to the ForgeAgent
# over stdin and stdout. DuckDB's native module sits beside it, and its extensions are installed here, so a
# job downloads nothing.
#
#   npm run build:data-connection-runtime     (bundles the runtime first, then builds this)
#
# Versions are pinned to releases at least two weeks old.

FROM node:22.23.1-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/quarry/runtime

RUN npm install --omit=dev --no-audit --no-fund @duckdb/node-api@1.4.5-r.1 \
    && node --input-type=module -e "import { DuckDBInstance } from '@duckdb/node-api'; const instance = await DuckDBInstance.create(':memory:'); await (await instance.connect()).run('INSTALL postgres');"

COPY applications/data-connection/runtime/dist/runtime.js /opt/quarry/runtime/runtime.js

ENTRYPOINT ["tini", "--", "node", "/opt/quarry/runtime/runtime.js"]
