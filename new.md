# Context
The monorepo has `@tusker/web` (Next.js), `@tusker/api` (Hono/Cloudflare Workers), and `@tusker/shared`.
The old root `src/` is still in use — `apps/web/tsconfig.json` falls back to `../../src/*`.
The user wants all Next.js server actions (`src/actions/`) converted to Hono API routes in `apps/api/`, not just copied to `apps/web/src/actions/`.

**What's already converted:**
- `src/actions/tag/*` → `apps/api/src/hono/routes/tags.ts` ✅
- `src/actions/daily-report*` → `apps/api/src/hono/routes/reports.ts` ✅

---

## Step 1 — Convert remaining `src/actions/` → Hono routes

### Board actions (only one not yet converted)
Create `apps/api/src/hono/routes/board.ts` from `src/actions/board/board-actions.ts`:

| Action | HTTP Route |
|---|---|
| `createBoardItem(workspaceId, memberId, note)` | `POST /api/v1/board` |
| `toggleBoardItemStatus(workspaceId, itemId, currentStatus)` | `PATCH /api/v1/board/:itemId/status` |
| `deleteBoardItem(workspaceId, itemId)` | `DELETE /api/v1/board/:itemId` |

Conversion rules (same pattern as existing routes):
- Replace `auth()` session check → `c.get("user")`
- Replace `revalidatePath()` → remove (web app will refetch via fetch-wrapper)
- Replace try-catch returns → `throw AppError.*()` (global error handler catches)
- Use `getDb()` from registry, not direct prisma import
- Register in `apps/api/src/index.ts`: `app.route("/board", board)`

### Update `apps/web/src/actions/` 
Any remaining files in `apps/web/src/actions/` that call server actions should be refactored to call the API via the fetch-wrapper client instead. Remove the `"use server"` directive pattern entirely.

---

## Step 2 — Move remaining `src/` frontend dirs → `apps/web/src/`

These have no Hono equivalent and belong in the web app.  
**Diff first** before copying — `apps/web/src/` already has skeleton dirs.

| From | To | Notes |
|---|---|---|
| `src/data/` | `apps/web/src/data/` | API fetch functions; update base URLs |
| `src/utils/` | `apps/web/src/utils/` | Pure helpers, safe to copy |
| `src/types/` | `apps/web/src/types/` | Merge with existing |
| `src/app/` | `apps/web/src/app/` | Merge; remove any `"use server"` action imports |
| `src/components/` | `apps/web/src/components/` | Merge with existing |
| `src/contexts/` | `apps/web/src/contexts/` | Merge with existing |
| `src/hooks/` | `apps/web/src/hooks/` | Merge with existing |
| `src/lib/` | `apps/web/src/lib/` | Merge; keep auth/db refs pointing to correct locations |
| `src/assets/` | `apps/web/src/assets/` | Static files |

---

## Step 3 — Move `src/hono/` → `apps/api/src/hono/`
The root `src/hono/` has `middleware/` and `routes/` — check for any routes not yet in `apps/api/src/hono/routes/` and merge them. Update imports to use `@/lib/registry` pattern.

---

## Step 4 — Fix duplicate Prisma schemas (delete the extra one)

**Why 2 schemas exist:** During the monorepo migration, a copy was made at `apps/api/prisma/schema.prisma` with its output pointing to `../src/generated/prisma`. But both apps already resolve `@/generated/prisma` → `packages/shared/generated/prisma` via tsconfig aliases. The API schema output path is misleading and unused.

**Source of truth:** `prisma/schema.prisma` (root) — generates to `packages/shared/generated/prisma` ✅  
**Redundant:** `apps/api/prisma/schema.prisma` — different output path, never actually used ❌

**Action:** Delete `apps/api/prisma/schema.prisma`. Keep only the root schema.  
Update `apps/api/package.json` db scripts to reference root schema:
```json
"db:generate": "prisma generate --schema=../../prisma/schema.prisma",
"db:migrate": "prisma migrate dev --schema=../../prisma/schema.prisma"
```
Or simply run all Prisma commands from the root package.json (already has them).

---

## Step 5 — Update `apps/web/tsconfig.json` aliases
Remove all fallbacks pointing to root `src/`:
```json
// Remove:
"@/lib/auth": "../../src/lib/auth.ts",
"@/lib/db": "../../src/lib/db.ts",
"@/generated/prisma": "../../src/generated/prisma",
"@/data/*": "../../src/data/*",
"@/server/*": "../../src/server/*",
// Change:
"@/*": ["./src/*", "../../src/*"]  →  "@/*": ["./src/*"]
```

---

## Step 6 — Verify & delete `src/`
```bash
pnpm --filter @tusker/api build   # No TS errors
pnpm --filter @tusker/web build   # No TS errors
```
Delete root `src/` only after both pass.

---

## Critical files to modify
- **Create**: `apps/api/src/hono/routes/board.ts`
- **Register**: `apps/api/src/index.ts` (add board route)
- **Merge**: `apps/web/src/` with remaining `src/` dirs
- **Update**: `apps/web/tsconfig.json` (remove root src/ fallback aliases)
- **Move**: `src/hono/` → `apps/api/src/hono/` (check for missing routes)

## Verification
1. Both apps build with `pnpm build`
2. Board CRUD works end-to-end via the new Hono route
3. Web app no longer imports from root `src/` (grep for `../../src/`)
4. Delete `src/` — confirm no broken imports
