# ==========================================
# API (Hono on @hono/node-server) — built from the repo root
#   docker build -f apps/api/Dockerfile .
# ==========================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm@10.18.1

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/core/package.json ./packages/core/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@10.18.1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/core ./packages/core

# The generated client is what @tusker/db actually exports at runtime.
RUN pnpm --filter @tusker/db exec prisma generate

# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV API_PORT=4000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

COPY --from=builder --chown=hono:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=hono:nodejs /app/apps/api /app/apps/api
COPY --from=builder --chown=hono:nodejs /app/packages /app/packages
COPY --from=builder --chown=hono:nodejs /app/package.json /app/pnpm-workspace.yaml /app/

USER hono
EXPOSE 4000

# tsx runs the TypeScript sources directly; env is injected by the platform
# (compose passes env_file), so no --env-file here.
CMD ["node", "--import", "tsx", "src/server.ts"]
