# 🚀 Tusker Management Performance & Caching Architecture

This document outlines the multi-layer caching strategy used to achieve "ClickUp-speed" performance. Every developer should follow these patterns when adding new features.

---

## 🏗️ The 5-Layer Cache Cake

| Layer | Technology | Purpose | UI Latency |
| :--- | :--- | :--- | :--- |
| **1. Browser** | TanStack Query | Optimistic Updates & Local Cache | **0ms** |
| **2. Request** | React `cache()` | Deduplicate queries in one render | **5ms** |
| **3. Persistent** | `unstable_cache` | Shared cache across users/sessions | **20-50ms** |
| **4. Database** | Prisma Indexes | Fast lookups on large tables | **1-10ms** |
| **5. Distributed** | Redis | Real-time presence & global config | **<2ms** |

---

## 🟢 Level 1: Browser-Side (Optimistic UI)
**The Golden Rule:** Don't wait for the server. Assume success.

- **Implementation:** Use `useTransition` or TanStack Query `onMutate`.
- **Flow:** User clicks "Complete" → UI toggles checkmark immediately → Server Action runs in background → If error, revert UI.

---

## 🟡 Level 2: Request Memoization
**The Golden Rule:** Never fetch the same data twice in one page load.

- **Implementation:** Wrap all data-fetching functions in `src/data/` with React's `cache()`.
```typescript
export const getWorkspacePermissions = cache(async (id: string) => {
  // Even if 10 components call this, it only hits the DB once.
});
```

---

## 🟠 Level 3: Persistent Data Cache
**The Golden Rule:** Surgical invalidation. Never clear the whole cache.

- **Implementation:** Use `unstable_cache` with granular tags.
- **Granular Tags:** Instead of `tags: ['tasks']`, use `tags: ['task-123', 'project-456']`.
- **Invalidation:** Only call `revalidateTag` for the specific entity that changed.

---

## 🔴 Level 4: Database Indexing
**The Golden Rule:** No `@index`, no query.

Every field used in a `where`, `orderBy`, or relation filter must have an index in `schema.prisma`.

**Required Task Indexes:**
```prisma
model Task {
  @@index([parentTaskId])        // Subtask lists
  @@index([projectId, status])   // Kanban/Filter views
  @@index([assigneeTo])          // "My Tasks"
  @@index([position])           // Drag & drop sorting
}
```

---

## 🚄 Level 5: API-First Interactivity
**The Golden Rule:** Server Components for initial load, Client Fetch for interaction.

1.  **Initial Load:** Use Server Components for SEO and fast First Contentful Paint.
2.  **Filtering/Search/Pagination:** Use client-side `fetch()` to Route Handlers (`/api/...`).
- **Benefit:** JSON payload is 10x smaller and 5x faster than re-rendering React Server Components.

---

## 🛠️ Data Function Template
Follow this pattern for all data functions in `src/data/`:

```typescript
/**
 * 1. Internal DB Query (Private)
 */
async function _getTaskInternal(taskId: string) {
  return prisma.task.findUnique({ where: { id: taskId } });
}

/**
 * 2. Cached Version (Cross-request)
 */
const getCachedTask = (id: string) => 
  unstable_cache(
    () => _getTaskInternal(id),
    [`task-${id}`], 
    { tags: [`task-${id}`] }
  )();

/**
 * 3. Public API (Memoized for current render)
 */
export const getTask = cache(async (id: string) => {
  const user = await requireUser(); // Auth Check
  return await getCachedTask(id);   // Data Fetch
});
```

---

## 📊 Monitoring
Check the **Browser Network Tab**:
- **Green Bar (TTFB):** If > 500ms, your Level 3 or 4 cache is failing.
- **Blue Bar (Content Download):** If > 1MB, you are fetching too many nested relations. Remove unused `include` statements.
