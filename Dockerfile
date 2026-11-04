# Node 24 runs the TypeScript server directly (type stripping), so the image
# only builds the web client. node:sqlite is built in: no native modules.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime dependencies installed fresh instead of pruning the build tree;
# npm prune can stall for minutes on some hosts.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-alpine
# The docker CLI and compose plugin run updates (pull, recreate one service).
RUN apk add --no-cache docker-cli docker-cli-compose
ENV NODE_ENV=production \
    PORT=3200 \
    DATA_DIR=/data \
    CATALOG_PATH=/config/services.yaml \
    STATIC_DIR=/app/dist/web \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY shared ./shared
COPY server ./server
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3200/healthz || exit 1
CMD ["node", "server/index.ts"]
