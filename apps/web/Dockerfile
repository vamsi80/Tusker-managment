# ==========================================
# Web (Next.js) — built from the repo root
#   docker build -f apps/web/Dockerfile .
# ==========================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm@10.18.1

# Manifests only, so dependency install stays cached across source edits.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@10.18.1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

# Placeholders so Better Auth can be imported at build time.
ENV BETTER_AUTH_SECRET="dummy_secret_must_be_32_characters_long_12345"
ENV BETTER_AUTH_URL="http://localhost:3000"

RUN pnpm --filter @tusker/db exec prisma generate
RUN pnpm --filter web build

# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/node_modules /app/node_modules
# Workspace packages are resolved through symlinks into these directories.
COPY --from=builder --chown=nextjs:nodejs /app/packages /app/packages

USER nextjs
EXPOSE 3000
CMD ["npx", "next", "start"]
