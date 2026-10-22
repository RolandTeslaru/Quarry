# One image for the server and both workers — docker-compose picks the command.
# Debian, not Alpine: DuckDB's native bindings (Data Connection worker) need glibc.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/integrations/package.json packages/integrations/
COPY packages/server/package.json packages/server/
COPY packages/data-connection-worker/package.json packages/data-connection-worker/
COPY packages/system-worker/package.json packages/system-worker/
COPY packages/frontend/package.json packages/frontend/
COPY packages/standard-ui/package.json packages/standard-ui/
RUN npm ci

COPY packages packages
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/integrations/package.json packages/integrations/
COPY packages/server/package.json packages/server/
COPY packages/data-connection-worker/package.json packages/data-connection-worker/
COPY packages/system-worker/package.json packages/system-worker/
RUN npm ci --omit=dev

# Each package's dist carries the shared/integrations code it compiled in.
COPY --from=build /app/packages/server/dist        packages/server/dist
COPY --from=build /app/packages/data-connection-worker/dist   packages/data-connection-worker/dist
COPY --from=build /app/packages/system-worker/dist packages/system-worker/dist

CMD ["node", "packages/server/dist/server/src/api.js"]
