# Plan: Vercel React Best Practices Audit & Fixes

## Context

The user's `.agents/skills/vercel-react-best-practices` skill defines 70+ rules across 8 impact categories (async waterfalls, bundle size, server performance, re-renders, rendering, JS perf, etc.). This audit checks whether `apps/web` complies and surfaces concrete violations to fix.

6 candidates were found across 3 severity tiers — all CONFIRMED or PLAUSIBLE by a verifier agent.

---

## Tier 1 — Security (Fix First)

### 1. Server actions bypass auth (CONFIRMED × 4)
The server actions in `src/actions/` forward calls to the Hono worker relying solely on browser cookies — no explicit `getSession()` check before any DB/API operation. A direct server-action call (e.g., via fetch or curl to the Next.js action endpoint) that carries no valid session cookie will succeed anyway if the worker's cookie-checking path has gaps.

**Files to fix:**
- `src/actions/daily-report-actions.ts` — `getDailyReportStatus`, `getDailyReportFormData`, `submitDailyReport` (lines 6–22)
- `src/actions/tag/create-tag.ts` (line 13)
- `src/actions/tag/update-tag.ts` (line 13)
- `src/actions/tag/delete-tag.ts` (line 11)

**Fix:** Add `const session = await auth.api.getSession({ headers: await headers() }); if (!session) return { error: "Unauthorized" }` at the top of each action, reusing the existing `requireUser` helper pattern from workspace layouts.

### 2. `checkUserExistsByPhone` ignores session result (CONFIRMED)
**File:** `src/app/actions/user.ts:62`  
`await getSession()` result is discarded; unauthenticated callers can enumerate valid phone numbers.  
**Fix:** Check the returned session; if null, return early with an unauthorized error.

---

## Tier 2 — Performance: Bundle Size (CONFIRMED × 3+)

### 3. Barrel imports of `apiClient` inflate client bundles
The `@/lib/api-client` barrel exports 6 sub-clients. Every file that does `import { apiClient } from '@/lib/api-client'` pulls all 6 into the bundle even when only one is used.

**Files to fix:**
- `src/lib/store/workspace-member-store.ts:3` — only uses `workspaces` methods → `import { workspacesClient } from '@/lib/api-client/workspaces'`
- `src/app/w/_components/sidebar/header/nav-workspaces-selector.tsx:16` — only uses `workspaces.getAll()` → same fix
- `src/app/w/[workspaceId]/reports/_components/report-table.tsx:17` — only uses `reports.getReports()` → `import { reportsClient } from '@/lib/api-client/reports'`

Grep for all occurrences of `from '@/lib/api-client'` (non-specific imports) and apply the same pattern throughout.

### 4. DataTable barrel import in project-procurement-client.tsx
**File:** `src/app/w/[workspaceId]/p/[slug]/procurement/_components/project-procurement-client.tsx:12`  
`import { DataTable } from "@/components/data-table"` — only `<DataTable>` is used.  
**Fix:** `import { DataTable } from "@/components/data-table/data-table"`

---

## Tier 3 — Performance: Server & Client Rendering (CONFIRMED + PLAUSIBLE)

### 5. Duplicate project-metadata fetches — missing `React.cache()` (CONFIRMED)
**File:** `src/app/w/[workspaceId]/p/[slug]/layout.tsx:16–18`  
Layout and child pages (`gantt/page.tsx:25`, `list/page.tsx:25`) each call `serverApiFetch('/projects/slug/{slug}/metadata...')` independently — 2–3 identical requests per navigation.

**Fix:** Extract the fetch into a cached helper:
```ts
// src/app/w/[workspaceId]/p/[slug]/_lib/get-project-metadata.ts
import { cache } from 'react';
export const getProjectMetadata = cache(async (slug: string, workspaceId: string) =>
  serverApiFetch(`/projects/slug/${slug}/metadata?workspaceId=${workspaceId}`)
);
```
Import and call `getProjectMetadata` in layout and all child pages.

### 6. `TaskTable` context value not memoized (CONFIRMED)
**File:** `src/components/task/list/task-table.tsx:76–93`  
`contextValue` object literal is recreated every render and passed to `TaskTableProvider`, causing all context consumers (`TaskRow`, `SubTaskRow`, etc.) to re-render on any parent state change.

**Fix:** Wrap with `useMemo`:
```ts
const contextValue = useMemo(() => ({
  workspaceId, projectId, members, ...
}), [workspaceId, projectId, members, ...]);
```

### 7. `Object.values(kanbanTasks).flat().find()` in render path (PLAUSIBLE)
**File:** `src/components/task/kanban/kanban-board.tsx:1099`  
Executed on every render when `pendingReviewMove` is truthy — O(n) flat + find over all columns × tasks.

**Fix:** Wrap in `useMemo` keyed on `kanbanTasks` and `pendingReviewMove.subTaskId`:
```ts
const pendingReviewTask = useMemo(() =>
  pendingReviewMove
    ? Object.values(kanbanTasks).flat().find(t => t.id === pendingReviewMove.subTaskId)
    : null,
  [kanbanTasks, pendingReviewMove?.subTaskId]
);
```

---

## Not In Scope (Deferred)

- `rerender-memo` for inline callbacks in KanbanBoard/SubTaskList — legitimate fixes but lower ROI without profiling data
- `console.log` removal in `user.ts` — covered by the existing Critical Issues memory entry

---

## Verification

1. **Security**: Run `npx tsc --noEmit` to confirm types pass; test each action route unauthenticated (no session cookie) and confirm 401/error is returned.
2. **Bundle**: Run `ANALYZE=true pnpm --filter @tusker/web run build` — check that `apiClient` barrel no longer appears in client chunks for the fixed files.
3. **React.cache()**: Add a `console.log` temporarily in the metadata fetch helper; navigate to a project page and confirm it logs only once.
4. **TaskTable useMemo**: Use React DevTools Profiler — sort or filter the task list and verify `TaskRow` components no longer flash re-renders from context changes.
5. **Kanban useMemo**: Open a large workspace kanban board; trigger an activity dialog and confirm no jank from repeated flat/find traversal.
