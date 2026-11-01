# One image for the server and both workers — docker-compose picks the command.
# Debian, not Alpine: DuckDB's native bindings (Data Connection worker) need glibc.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY libraries/shared/package.json libraries/shared/
COPY libraries/integrations/package.json libraries/integrations/
COPY platform/server/package.json platform/server/
COPY applications/data-connection/worker/package.json applications/data-connection/worker/
COPY platform/system-worker/package.json platform/system-worker/
COPY platform/frontend/package.json platform/frontend/
COPY libraries/standard-ui/package.json libraries/standard-ui/
RUN npm ci

COPY libraries libraries
COPY platform platform
COPY applications applications
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY libraries/shared/package.json libraries/shared/
COPY libraries/integrations/package.json libraries/integrations/
COPY platform/server/package.json platform/server/
COPY applications/data-connection/worker/package.json applications/data-connection/worker/
COPY platform/system-worker/package.json platform/system-worker/
RUN npm ci --omit=dev

# Each package's dist carries the shared/integrations code it compiled in.
COPY --from=build /app/platform/server/dist        platform/server/dist
COPY --from=build /app/applications/data-connection/worker/dist   applications/data-connection/worker/dist
COPY --from=build /app/platform/system-worker/dist platform/system-worker/dist

CMD ["node", "platform/server/dist/platform/server/src/api.js"]
