# One image for api, sync-worker and system-worker — docker-compose picks the entry point.
# Debian, not Alpine: DuckDB's native bindings need glibc.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN npm ci

COPY packages/shared packages/shared
COPY packages/server packages/server
RUN npm run build --workspace=packages/server

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN npm ci --omit=dev

COPY --from=build /app/packages/server/dist packages/server/dist
WORKDIR /app/packages/server

CMD ["node", "dist/server/src/api.js"]
