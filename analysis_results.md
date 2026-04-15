# Architectural Review: Tusker Management

Based on a review of your current codebase, I have analyzed the architecture to understand how it impacts scaling and performance. Below is a breakdown of the current state, its scaling impact, and the "Proper Structure" you should aim for.

## 1. Current State of the Architecture

Your application currently utilizes a **hybrid/fragmented backend approach** within a Next.js App Router project:

1. **Next.js Server Actions (`src/actions/`):** Contains massive amounts of logic for mutating data (e.g., `create-task.ts`, `update-task.ts`). These handle validation, authorization, service calling, and cache invalidation.
2. **Hono REST API (`src/hono/`):** You are mounting a Hono API on `src/app/api/[[...route]]/route.ts`. It also handles endpoints like `tasks.patch("/:taskId/assignee")`, specifically to avoid the Next.js RSC (React Server Component) heavy re-renders.
3. **Service Layer (`src/server/services/`):** E.g., `tasks.service.ts` (982 lines) holds heavy business logic and transaction management. Both Hono and Server Actions call this layer.
4. **Data Access Layer (`src/data/`):** Contains direct Prisma queries (like `get-tasks.ts` at 40kb) that are consumed by various parts of the app.
5. **State/Caching:** You are using manual invalidation (`invalidateTaskMutation`) heavily coupled to Server Actions.

## 2. Impact on Scaling

You mentioned you *know* the architecture isn't proper. Here is exactly how this structure hurts your ability to scale:

> [!WARNING]
> **Heavy RSC Payloads & Next.js Coupling**
> Server Actions automatically trigger React Server Component (RSC) re-evaluations for the current route. For simple tasks like updating an assignee, this forces Next.js to reconstruct the view and send a large JSON payload over the wire. You recognized this and built the Hono endpoint for `assignee`, but having a mixed-mutation strategy (some Actions, some Hono endpoints) makes the app unpredictable, hard to cache, and sluggish on weak network connections.

> [!CAUTION]
> **API Portability & Mobile Preparedness**
> Right now, your core logic is trapped inside Next.js Server Actions. If you ever want to launch a mobile app (React Native/Flutter) or a desktop client, those clients cannot easily call Next.js Server Actions. You would have to duplicate all of `src/actions` into `src/hono`, which is an integration nightmare.

> [!CAUTION]
> **State Mismatch (Race Conditions)**
> Using Server Actions for some things and Client-side fetching (Hono) for others leads to desynchronized UI state. The Next.js Next.js Router Cache and your client-side stores (like `zustand`) will constantly fight each other, leading to "stale data" bugs.

> [!IMPORTANT]
> **Monolithic Bottleneck**
> Your Hono API is running *inside* Next.js on Node.js (`runtime = "nodejs"`). By coupling the API to the UI framework, you cannot scale them independently. If your UI traffic spikes, it starves resources for your background API processes.

---

## 3. The "Proper" Scalable Architecture

To achieve massive scale, sub-second latency (the "Zero-Data Shell" you've been working towards), and clean maintainability, you need to transition to a **Strict API-Driven Architecture (Headless / BFF Pattern)**.

### Target Directory Structure

```text
src/
├── core/                       # 1. Independent Core (No Next.js dependencies)
│   ├── services/               # Business logic & Transactions (TasksService)
│   ├── respositories/          # Direct DB access (Prisma wrappers, getTasks)
│   └── lib/                    # Core utilities (Permissions, Audit, AI wrappers)
│
├── api/                        # 2. Hono API Layer (The Only Backend)
│   ├── routes/                 # Hono Routers (REST endpoints)
│   ├── middleware/             # Auth, Rate limiting, Validation middleware
│   └── server.ts               # Standalone entry point
│
├── app/                        # 3. Next.js Frontend Shell
│   ├── (main)/...              # Pure View components
│   └── api/[[...route]]/       # Mounted Hono API (for now, until deployed separately)
│
└── components/                 # UI Library & Client state
    ├── ui/                     # Shadcn components
    └── providers/              # TanStack Query / Zustand stores
```

### The Rules of the New Architecture

1. **RIP Server Actions (Mostly):** 
   Stop using `src/actions` for any mutations (Create/Update/Delete). Migrate all Server Actions to Hono API Routes (`src/hono/routes`). Server Actions should ONLY be used for progressive enhancement on server-rendered public forms (like login if needed), but honestly, you don't even need them.
2. **TanStack React Query for State:** 
   Your components should mutate and fetch data exclusively through the Hono API using an async state manager like `@tanstack/react-query` or `SWR`. This eliminates heavy RSC payloads entirely because mutations just return standard slim JSON (like `{success: true}`), and you update the UI optimistically.
3. **Pure Separation of Concerns layer:**
   - **Route Layer (`src/hono/routes`)**: Parses parameters, checks Auth, passes to Service, returns JSON.
   - **Service Layer (`src/server/services`)**: Enforces business logic, permissions logic, handles transactions, creates audit logs.
   - **Data Layer (`src/data`)**: Prisma queries, filtering, aggregation.
4. **Deploy API Separately (Future Proofing):** 
   Because Hono works on edge network, by putting everything in Hono, you can eventually take the `src/hono` and `src/server/services` folders and deploy them on **Cloudflare Workers** or an independent **Node/Docker** service. Your Next.js app then becomes a pure, static front-end that scales infinitely on Vercel/CDN, while your DB connections and heavy logic are handled by a dedicated backend cluster.

### Summary of How Data Should Flow

**The Old Way:**
User clicks "Save Task" -> Server Action -> Checks Auth -> Prisma Update -> **Next.js Rebuilds Entire Page Tree** -> Sends 50kb HTML/RSC payload -> UI updates slowly.

**The Scalable Proper Way:**
User clicks "Save Task" -> Optimistic UI update immediately (0ms latency) -> `fetch('/api/v1/tasks/123')` (Hono) -> Checks Auth -> Prisma Update -> Returns `{ status: "COMPLETED" }` (50 bytes) -> Cache receives confirmation. No RSC. No layout shifting. Blazing fast.
