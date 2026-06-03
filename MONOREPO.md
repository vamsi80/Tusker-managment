# Tusker Management — Monorepo

## Structure

```
tusker-management/
├── apps/
│   ├── api/          → Hono backend (Cloudflare Workers)
│   └── web/          → Next.js frontend (Vercel)
├── packages/
│   └── shared/       → Shared Zod schemas + TypeScript types
├── pnpm-workspace.yaml
└── package.json
```

## Local Development

### 1. Install dependencies
```bash
pnpm install
```

### 2. Set up environment variables

**API (`apps/api/.dev.vars`)** — copy from `.dev.vars.example`:
```
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:8787
DATABASE_URL=postgresql://...
APP_URL=http://localhost:3000
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com
# ... see .dev.vars.example for full list
```

**Web (`apps/web/.env.local`)** — copy from `.env.local.example`:
```
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=ap2
```

### 3. Generate Prisma client
```bash
cd apps/api && pnpm db:generate
```

### 4. Start both apps
```bash
# Terminal 1 — API (CF Workers local dev)
pnpm api:dev

# Terminal 2 — Web (Next.js)
pnpm web:dev
```

## Deployment

### API → Cloudflare Workers

1. Set up Cloudflare Hyperdrive for PostgreSQL:
```bash
cd apps/api
wrangler hyperdrive create tusker-db --connection-string="postgresql://..."
# Copy the ID into wrangler.toml [[hyperdrive]] binding
```

2. Set secrets:
```bash
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put DATABASE_URL        # Until Hyperdrive is set up
wrangler secret put RESEND_API_KEY
# ... set all secrets from .dev.vars.example
```

3. Deploy:
```bash
pnpm api:deploy
```

### Web → Vercel

Set these environment variables in Vercel dashboard:
- `NEXT_PUBLIC_API_URL` = your CF Worker URL (e.g., `https://tusker-api.workers.dev`)
- `NEXT_PUBLIC_APP_URL` = your Vercel URL
- `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`

```bash
pnpm web:build
```

## Cross-Domain Authentication

Session cookies require both apps to share a root domain for cookie sharing.

**Recommended setup:**
- Web: `app.yourdomain.com` → Vercel
- API: `api.yourdomain.com` → Cloudflare Workers (custom domain)

The `BETTER_AUTH_URL` in the API must match the API domain. Better Auth will set cookies with `domain=.yourdomain.com`.
