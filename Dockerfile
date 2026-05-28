# ==========================================
# STAGE 1: Install Dependencies
# ==========================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Enable corepack to get the matching pnpm version or install it
RUN npm install -g pnpm@10.18.1

# Copy lockfile and package config
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (ignore postinstall scripts like prisma generate during cache layer build)
RUN pnpm install --ignore-scripts


# ==========================================
# STAGE 2: Build the Application
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@10.18.1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

# Build-time environment placeholders to prevent Better-Auth compilation crashes
ENV BETTER_AUTH_SECRET="dummy_secret_must_be_32_characters_long_12345"
ENV BETTER_AUTH_URL="http://localhost:3000"


# Generate Prisma Client (essential before next build)
RUN pnpm prisma generate

# Build the Next.js application
RUN pnpm build

# ==========================================
# STAGE 3: Production Runner
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create a system user and group for maximum runtime security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public static files
COPY --from=builder /app/public ./public

# Copy the built application and dependency trees
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma

# Use the non-root user
USER nextjs

# Expose the internal port
EXPOSE 3000

# Execute next start
CMD ["npx", "next", "start"]
