# RSC Payload Analysis

## Summary

The largest React Server Components navigation payload risk is concentrated in the workspace task and project task routes. The current build artifacts show the biggest client reference manifests around these routes:

| Route | Approx manifest size | Risk |
| --- | ---: | --- |
| `/w/[workspaceId]/p/[slug]` | 46 KB | Highest |
| `/w/[workspaceId]/tasks` | 45.2 KB | Highest |
| `/w/[workspaceId]/team/settings` | 24.2 KB | Medium |
| `/w/[workspaceId]/team/attendance` | 21 KB | Medium |
| `/w/[workspaceId]/team`, `/team/leaves`, `/settings/activity`, `/settings` | 20-21 KB | Medium |
| `/reports`, `/info`, `/my-board` | 16 KB | Lower |

These manifest sizes are not exactly the runtime `_rsc` response body, but they explain why client navigation can regularly exceed 5 KB and sometimes jump close to 40 KB. The heavy routes combine broad client component references with server-fetched data passed into client components.

## Main Sources

### 1. Workspace Task List Sends Initial Rows Through RSC

File:

`src/app/w/[workspaceId]/tasks/_components/views/list/workspace-list-view.tsx`

The server component fetches and passes all of this into `TaskTable`:

- current user
- workspace projects
- workspace project members
- permissions
- up to 50 initial tasks
- task facets/project counts

This means every navigation to `/w/[workspaceId]/tasks?view=list` can serialize a sizeable task payload into the RSC response.

### 2. Project Task List Includes Descriptions

File:

`src/app/w/[workspaceId]/p/[slug]/_components/list/project-task-list-view.tsx`

The project list calls:

```ts
TasksService.getTasks({
  workspaceId,
  projectId,
  hierarchyMode: "parents",
  includeSubTasks: false,
  limit: 50,
  view_mode: "list",
  extraFields: ["description"],
}, user.id)
```

Descriptions are text fields. If task descriptions are long, this can cause the RSC payload to spike quickly.

### 3. Default Task Select Is Too Broad For Initial Lists

File:

`src/lib/tasks/query-builder.ts`

`getTaskSelect("list")` currently includes:

- `description`
- assignee relation
- reviewer relation
- createdBy relation
- tags
- counts
- parent task
- date fields
- project/workspace IDs

This is a useful full row shape, but too much for initial navigation. A list shell usually only needs minimal row fields first, then details can load when a row or subtask sheet opens.

### 4. Member Queries Include Full User Records

File:

`src/server/services/project/project.repository.ts`

These methods use `include: { user: true }`:

- `getProjectMembers`
- `getProjectMembersByWorkspace`

Full user records are then mapped and passed into client components. For task tables, kanban, and gantt, the UI usually needs only:

- `id`
- `name`
- `surname`
- `image`
- sometimes `email`

### 5. Workspace Shell Is A Large Client Boundary

File:

`src/app/w/_components/sidebar/workspace-shell.tsx`

The workspace shell is a client component and pulls in:

- sidebar
- header
- workspace layout provider
- notification listener
- global subtask sheet
- top loader
- sidebar UI system

Because this sits under `/w/[workspaceId]/layout.tsx`, every workspace route inherits a large client reference baseline.

### 6. Query Param Views Keep Multiple Heavy Views Under One Route

Files:

- `src/app/w/[workspaceId]/tasks/page.tsx`
- `src/app/w/[workspaceId]/p/[slug]/page.tsx`

Both pages switch views using `searchParams.view`. The route still imports or references multiple possible view branches: list, kanban, gantt, and dashboard. That increases the route manifest and can make navigation payloads heavier than necessary.

## Phased Implementation Plan

### Phase 1: Immediate Payload Reduction (Quick Wins)
*Goal: Reduce the amount of data serialized in RSC payloads without significant architectural changes.*

1.  **Remove Descriptions from Task Lists** (Priority 1)
    -   **File:** `src/app/w/[workspaceId]/p/[slug]/_components/list/project-task-list-view.tsx`
    -   **Action:** Remove `extraFields: ["description"]` from `TasksService.getTasks` call.
    -   **Benefit:** Prevents large text spikes in the RSC stream.

2.  **Reduce Initial Fetch Limits** (Priority 4)
    -   **Files:** `workspace-list-view.tsx`, `workspace-gantt-view.tsx`, `project-task-list-view.tsx`
    -   **Action:** Change `limit: 50` to `limit: 25`.
    -   **Benefit:** Cuts the initial row payload in half while maintaining "enough" data for first render.

3.  **Implement Lean Member Queries** (Priority 5)
    -   **File:** `src/server/services/project/project.repository.ts`
    -   **Action:** Replace `include: { user: true }` with a specific `select` (id, name, surname, image).
    -   **Benefit:** Reduces the metadata size for every member attached to a task or project.

### Phase 2: Data Schema Optimization
*Goal: Optimize the query builder to ensure only essential fields are serialized by default.*

4.  **Create Minimal Initial Task Row Shape** (Priority 2)
    -   **File:** `src/lib/tasks/query-builder.ts`
    -   **Action:** Refactor `getTaskSelect("list")` to exclude heavy relations and fields (description, full tags, parentTask) unless explicitly requested.
    -   **Benefit:** Systematically reduces payload for all task list navigations.

### Phase 3: Architectural Migration (RSC -> API)
*Goal: Move heavy data fetching to client-side API calls to keep navigation instantaneous.*

5.  **Move Task Rows to Client API Fetch** (Priority 3)
    -   **Views:** Workspace Tasks & Project Tasks (List/Gantt/Kanban).
    -   **Action:** Render only the view shell (toolbar, filters) in RSC. Fetch actual task rows from `/api/v1/tasks` using React Query or a similar client-side hook.
    -   **Benefit:** Navigation becomes structural and ultra-fast. Data loading happens in parallel, with better loading state control (skeletons).

### Phase 4: Route & Bundle Optimization
*Goal: Improve manifest sizes and bundle splitting by utilizing Next.js routing patterns.*

6.  **Split Views into Dedicated Routes** (Priority 6)
    -   **Structure:** Move from `?view=kanban` to `/w/[workspaceId]/tasks/kanban`.
    -   **Action:** Create separate route segments for each major view.
    -   **Benefit:** Prevents the browser from loading Kanban components when a user only wants to see the List view, significantly reducing the Client Reference Manifest.

## Validation Plan

After changes, validate with:

```bash
npm run build
```

Then inspect:

```powershell
Get-ChildItem -Recurse .next\server\app -File -Include *client-reference-manifest.js |
  Sort-Object Length -Descending |
  Select-Object @{Name='KB';Expression={[math]::Round($_.Length/1KB,1)}},FullName
```

For runtime payloads, use browser DevTools:

1. Open Network tab.
2. Filter by `_rsc`.
3. Navigate between workspace routes.
4. Compare response sizes before and after each fix.

Target:

- Common route navigation `_rsc` payloads should stay below 5 KB.
- Task/project route navigation should no longer spike toward 40 KB.
- Large task data should appear as paginated API JSON, not as route navigation RSC.
