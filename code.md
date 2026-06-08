# Implementation Plan: Add Cloudflare Hyperdrive

## Context

The API runs on Cloudflare Workers with `@prisma/adapter-pg` (direct `pg.Pool` per request, NOT Prisma Accelerate). Each request creates a fresh TCP connection to Supabase (ap-south-1). That connection setup — TCP handshake + SSL negotiation — costs ~50–100ms *before* any query runs. With 7 parallel kanban queries, the floor is already 350–700ms just from connection overhead.

Hyperdrive keeps warm TCP connections at Cloudflare's edge. Worker → Hyperdrive is ~1ms (local network). Hyperdrive → Supabase is a persistent connection (no handshake per request). Expected result: connection overhead drops from ~100ms to ~5ms per query, cutting the kanban endpoint from ~2300ms toward ~800ms with zero query-logic changes.

The stubs are already in the repo (`wrangler.toml` lines 11-13 commented, `types.ts` line 12 commented). This is a 3-file change.

---

## Step 1 — Create the Hyperdrive config in Cloudflare (one-time CLI command)

Run this once from your terminal (use the **direct** port 5432 URL, NOT the PgBouncer port 6543, because Hyperdrive IS the pooler):

```bash
wrangler hyperdrive create tusker-hyperdrive \
  --connection-string="postgresql://postgres.huruairekknyibistusz:PASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
```

This prints a Hyperdrive config ID (e.g., `abc123`). Copy it — you'll need it in Step 2.

---

## Step 2 — Wire the binding into wrangler.toml

**File:** `apps/api/wrangler.toml` (lines 9–13, currently commented)

Uncomment and fill in the ID from Step 1:

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "abc123"          # ← paste your ID here
```

For local dev, Hyperdrive is not available, so add a local fallback:

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "abc123"
localConnectionString = ""   # empty string → code falls back to DATABASE_URL in dev
```

---

## Step 3 — Uncomment the HYPERDRIVE type

**File:** `apps/api/src/types.ts` (line 12)

```typescript
// Before:
// HYPERDRIVE: Hyperdrive; // Uncomment after setting up Cloudflare Hyperdrive

// After:
HYPERDRIVE?: Hyperdrive;   // optional so local dev without the binding still compiles
```

---

## Step 4 — Update createDbClient to accept Hyperdrive

**File:** `apps/api/src/lib/db.ts`

Change the function signature to accept either a raw connection string or the Hyperdrive binding:

```typescript
// Before:
export function createDbClient(connectionString: string) {
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
    max: 1,
    connectionTimeoutMillis: 20000,
  });
  // ...
}

// After:
export function createDbClient(source: string | Hyperdrive) {
  const connStr = typeof source === "string" ? source : source.connectionString;
  const pool = new Pool({
    connectionString: connStr,
    // Hyperdrive handles SSL at the edge — disable SSL for the local Worker→Hyperdrive leg
    ssl: typeof source === "string" && connStr.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 20000,
  });
  // rest unchanged
}
```

The `Hyperdrive` type is available from `@cloudflare/workers-types` — no new import needed (already in the project via `wrangler`).

---

## Step 5 — Pass HYPERDRIVE binding from registry

**File:** `apps/api/src/lib/registry.ts` (line 61)

```typescript
// Before:
const db = createDbClient(env.DATABASE_URL);

// After:
const db = createDbClient(env.HYPERDRIVE ?? env.DATABASE_URL);
```

`env.HYPERDRIVE` is undefined in local dev (`wrangler dev`) → falls back to `DATABASE_URL` transparently.

---

## Critical files

| File | Change |
|---|---|
| `apps/api/wrangler.toml` | Uncomment and fill Hyperdrive binding |
| `apps/api/src/types.ts` | Make `HYPERDRIVE?: Hyperdrive` optional |
| `apps/api/src/lib/db.ts` | Accept `string \| Hyperdrive` in `createDbClient` |
| `apps/api/src/lib/registry.ts` | Pass `env.HYPERDRIVE ?? env.DATABASE_URL` |

---

## Verification

1. **Deploy to Cloudflare** (`wrangler deploy` from `apps/api`) — Hyperdrive only works in the deployed environment, not `wrangler dev`.
2. **Check response times** — hit the kanban endpoint and watch the `[PERF:SERVER] LIST_TASKS_SERVICE` log. Expect it to drop from 2300ms toward 700–900ms.
3. **Local dev still works** — run `wrangler dev`, confirm requests go through without `HYPERDRIVE` binding (falls back to `DATABASE_URL`).
4. **Check Hyperdrive analytics** in the Cloudflare dashboard → Workers & Pages → Hyperdrive → your config. It shows cache hit rate and query latency.

---

## Architecture note: view routing

Do NOT convert `?vm=kanban` / `?vm=list` query-param views to separate Next.js routes until the task endpoint is below ~300ms. At current speeds (2300ms kanban), every view-tab click would feel like a full page reload. When performance is fixed, use Next.js **Parallel Routes** (`@slot` syntax in the layout) — gives URL-based view switching without re-mounting the workspace shell.
