# Plan: Complete the Monorepo Separation (Remaining Work)

> **Status:** The scaffold is done — monorepo structure, `packages/shared`, `apps/api`, `apps/web` all exist with files copied. What remains are targeted code fixes to clear type errors, generate Prisma, and wire local dev.

---

## Context

The backend (Hono + Prisma + Better Auth) has been extracted from the Next.js monolith into `apps/api` targeting Cloudflare Workers. The frontend is in `apps/web`. The shared Zod schemas live in `packages/shared`. An audit of `apps/api/src` shows **5 categories of remaining fixes**, then Prisma generation, then verification.

---

## Step 0 — Create `TODO.md` in the repo root

Create `d:\Github\Tusker-managment\TODO.md` as a checklist so the team can track progress in the repo itself.

---

## Step 1 — Fix `types/attendance.ts` and `types/leave.ts`

**Problem:** Both files import from `"@/generated/prisma/client"` which is a wrong sub-path.

**Fix:** Change both to `"@/generated/prisma"`:

```typescript
// types/attendance.ts  and  types/leave.ts
// Before:
import { AttendanceStatus } from "@/generated/prisma/client";
// After:
import { AttendanceStatus } from "@/generated/prisma";
```

**Files:**
- [apps/api/src/types/attendance.ts](apps/api/src/types/attendance.ts)
- [apps/api/src/types/leave.ts](apps/api/src/types/leave.ts)

---

## Step 2 — Fix bare `prisma.` calls (replace with `getDb()`)

**Problem:** 5 files still reference a bare `prisma` global (not replaced by the earlier sed).

**Pattern for every fix:**
```typescript
// Before:
prisma.$transaction(...)
const client = tx || prisma;
prisma.$queryRaw`...`
(prisma as any).leave_request.create(...)

// After:
getDb().$transaction(...)
const client = tx || getDb();
getDb().$queryRaw`...`
(getDb() as any).leave_request.create(...)
```

Also add `import { getDb } from "@/lib/registry";` to any file that's missing it.

**Files to fix:**
- [apps/api/src/server/services/task/task.repository.ts](apps/api/src/server/services/task/task.repository.ts) — `prisma.$transaction()` in ~7 places
- [apps/api/src/server/services/procurement/vendor/vendor.service.ts](apps/api/src/server/services/procurement/vendor/vendor.service.ts) — `prisma.$transaction()` line ~66
- [apps/api/src/server/services/procurement/vendor/vendor.repository.ts](apps/api/src/server/services/procurement/vendor/vendor.repository.ts) — `prisma.$queryRaw` line ~11
- [apps/api/src/server/services/procurement/indent/indent.repository.ts](apps/api/src/server/services/procurement/indent/indent.repository.ts) — `prisma.$transaction()` and `const client = tx || prisma`
- [apps/api/src/server/services/conversation/conversation.service.ts](apps/api/src/server/services/conversation/conversation.service.ts) — `prisma.$transaction()` line ~167
- [apps/api/src/server/services/leave/leave.repository.ts](apps/api/src/server/services/leave/leave.repository.ts) — `(prisma as any).leave_request.create(...)`

**Bash shortcut:**
```bash
find apps/api/src -name "*.ts" -exec sed -i 's/\bprisma\.\$/getDb().\$/g' {} \;
find apps/api/src -name "*.ts" -exec sed -i 's/const client = tx || prisma/const client = tx || getDb()/g' {} \;
find apps/api/src -name "*.ts" -exec sed -i 's/(prisma as any)/(getDb() as any)/g' {} \;
```

---

## Step 3 — Fix `get-daily-reports.ts` undefined `actorId`

**Problem:** Line 46 calls `getWorkspacePermissions(workspaceId, actorId)` but the function was updated to accept `actorId` only in the first call (line 8). The second call at line 46 uses `actorId` which is in scope — verify it's the right variable. If the second function in that file also needs an actor, add `actorId: string` to its parameter list.

**File:** [apps/api/src/data/daily-report/get-daily-reports.ts](apps/api/src/data/daily-report/get-daily-reports.ts)

Read line 40–55, check the second exported function's signature, and ensure `actorId` is a named parameter.

---

## Step 4 — Fix `auth` middleware `c.set()` type errors

**Problem:** `auth.ts` middleware calls `c.set("user", ...)` and `c.set("session", ...)` but TypeScript complains about the overload because the Hono context doesn't declare these variables in `Variables`.

**Fix:** The middleware in [apps/api/src/hono/middleware/auth.ts](apps/api/src/hono/middleware/auth.ts) should cast:
```typescript
c.set("user" as any, session.user);
c.set("session" as any, session.session);
```
This is already `as any` in the file — check if the error is actually on the `c.set` lines or on something else. If it's `No overload matches this call` for `createMiddleware`, change the generic to `<{ Bindings: Env; Variables: any }>`.

---

## Step 5 — Generate Prisma client in `apps/api`

The `apps/api/src/generated/` directory does not exist yet — Prisma client has never been generated in this package. Without it, all `@/generated/prisma` imports fail at compile time.

```bash
cd apps/api
pnpm db:generate
# This runs: prisma generate --schema=prisma/schema.prisma
```

This creates `apps/api/src/generated/prisma/` and resolves all the "Cannot find module '../generated/prisma'" errors in:
- `lib/constants/project-access.ts`
- `lib/constants/workspace-access.ts`
- `lib/tasks/filter-utils.ts`
- `lib/tasks/query-builder.ts`
- `lib/db.ts`
- `lib/indent-item-status.ts`
- `types/attendance.ts` (after Step 1)
- `types/leave.ts` (after Step 1)

---

## Step 6 — Run type-check and fix remaining errors

```bash
cd apps/api
pnpm type-check 2>&1 | grep "error TS" | grep -v "implicitly has"
```

**Expected remaining errors after Steps 1–5:** Only `implicitly has 'any' type` warnings (non-blocking for runtime) and possibly a few route-level mismatches. Fix each one reported.

The `implicitly has 'any' type` errors in route files (e.g. `.map(m => ...)`) are safe to fix by adding `: any` to the parameter: `.map((m: any) => ...)`.

---

## Step 7 — Set up local dev environment

### `apps/api/.dev.vars`
Copy from `.dev.vars.example` and fill in:
```
BETTER_AUTH_SECRET=<any-random-string-32chars>
BETTER_AUTH_URL=http://localhost:8787
DATABASE_URL=<your-supabase-postgres-url>
APP_URL=http://localhost:3000
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=ap2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=...
CRON_SECRET=any-secret
```

### `apps/web/.env.local`
Copy from `.env.local.example` and fill in:
```
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=ap2
```

---

## Step 8 — Smoke test locally

```bash
# Terminal 1 — API
cd apps/api
pnpm db:generate        # if not done yet
pnpm dev                # wrangler dev → http://localhost:8787

# Terminal 2 — Web
cd apps/web
pnpm dev                # next dev → http://localhost:3000
```

Verify:
1. `curl http://localhost:8787/api/v1/health` returns `{"success":true,"status":"ok",...}`
2. Open `http://localhost:3000` — sign-up page loads
3. Sign up → auth request hits `:8787/api/auth/sign-up` (check browser Network tab)
4. After login, navigate to a workspace — API calls go to `:8787/api/v1/...`

---

## Step 9 — Production deploy to Cloudflare

```bash
cd apps/api

# 1. Set up Hyperdrive (replaces raw DATABASE_URL for production)
wrangler hyperdrive create tusker-db \
  --connection-string="postgresql://user:pass@host:5432/db?sslmode=require"
# Copy the returned ID into wrangler.toml [[hyperdrive]] binding

# 2. Set secrets
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put BETTER_AUTH_URL       # e.g. https://tusker-api.workers.dev
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM_EMAIL
wrangler secret put PUSHER_APP_ID
wrangler secret put PUSHER_KEY
wrangler secret put PUSHER_SECRET
wrangler secret put PUSHER_CLUSTER
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
wrangler secret put AWS_REGION
wrangler secret put AWS_S3_BUCKET_NAME
wrangler secret put CRON_SECRET
wrangler secret put APP_URL               # your Vercel web URL

# 3. Deploy
wrangler deploy
```

After deploy, update `NEXT_PUBLIC_API_URL` in Vercel dashboard to the CF Worker URL.

---

## Critical Files Modified (Steps 1–4)

| File | Change |
|---|---|
| `apps/api/src/types/attendance.ts` | `@/generated/prisma/client` → `@/generated/prisma` |
| `apps/api/src/types/leave.ts` | same |
| `apps/api/src/server/services/task/task.repository.ts` | `prisma.$transaction` → `getDb().$transaction` |
| `apps/api/src/server/services/procurement/vendor/vendor.service.ts` | same |
| `apps/api/src/server/services/procurement/vendor/vendor.repository.ts` | `prisma.$queryRaw` → `getDb().$queryRaw` |
| `apps/api/src/server/services/procurement/indent/indent.repository.ts` | `prisma.$transaction` + `tx \|\| prisma` |
| `apps/api/src/server/services/conversation/conversation.service.ts` | `prisma.$transaction` |
| `apps/api/src/server/services/leave/leave.repository.ts` | `(prisma as any)` → `(getDb() as any)` |
| `apps/api/src/data/daily-report/get-daily-reports.ts` | Add `actorId` param to second export |
| `apps/api/src/hono/middleware/auth.ts` | Fix generic type on `createMiddleware` |

---

## Verification

```bash
# 1. Prisma generated
ls apps/api/src/generated/prisma/

# 2. Zero structural type errors
cd apps/api && pnpm type-check 2>&1 | grep "error TS" | grep -v "implicitly has"
# Expected output: (empty)

# 3. Wrangler dry-run (CF bundler compatibility check)
cd apps/api && wrangler deploy --dry-run
# Expected: "Dry run" success, no Node.js-incompatible module errors

# 4. Health check
cd apps/api && pnpm dev &
curl http://localhost:8787/api/v1/health
# Expected: {"success":true,"status":"ok"}
```
