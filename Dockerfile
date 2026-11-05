# Node 24 runs the TypeScript server directly (type stripping), so the image
# only builds the web client. node:sqlite is built in: no native modules.

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime dependencies installed fresh instead of pruning the build tree;
# npm prune can stall for minutes on some hosts.
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Slim: everything except the Docker CLI. Updates from the UI are off;
# reading Docker through its socket works the same. Build it with
# --target slim, or pull the -slim tags.
FROM node:26-alpine AS slim
LABEL org.opencontainers.image.title="Patchboard" \
      org.opencontainers.image.description="A control center and start page for a home server." \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/sourpatchdad/patchboard"
ENV NODE_ENV=production \
    PORT=3200 \
    DATA_DIR=/data \
    CATALOG_PATH=/config/services.yaml \
    STATIC_DIR=/app/dist/web \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json LICENSE ./
COPY shared ./shared
COPY server ./server
# /data belongs to the node user, so a named volume there inherits that and
# Patchboard can run as node (see examples/hardened).
RUN mkdir -p /data && chown node:node /data
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3200/healthz || exit 1
CMD ["node", "server/index.ts"]

# Full, the default: adds the Docker CLI and compose plugin, which run
# updates (pull, recreate one service).
FROM slim AS full
RUN apk add --no-cache docker-cli docker-cli-compose
