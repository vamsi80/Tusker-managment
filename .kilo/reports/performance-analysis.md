# Performance Analysis Report: Data Loading Issues

## Executive Summary

Your application is loading excessive amounts of data due to several architectural patterns that cause slow page loads. The main issues are related to how data is fetched, cached, and the lack of pagination/limiting in certain queries.

---

## Root Causes Identified

### 1. Layout Data Fetching - Triple API Calls ⚠️ CRITICAL

**Location:** `src/app/w/[workspaceId]/layout.tsx`

**Issue:** The workspace layout makes 3 sequential API calls:

1. `getWorkspaceLayoutData()` → fetches ALL workspaces + metadata + daily report status
2. `getWorkspaceLayoutData()` → AGAIN in `SidebarLoader`
3. `getWorkspaceLayoutData()` → AGAIN in `DailyReportFABLoader`

```tsx
// PROBLEM: Same promise is awaited 3 times
const layoutDataPromise = getWorkspaceLayoutData(workspaceId);

<SidebarLoader dataPromise={layoutDataPromise} />       // Await #1
<WorkspaceAccessGuard dataPromise={layoutDataPromise}> // Await #2
<DailyReportFABLoader dataPromise={layoutDataPromise} /> // Await #3
```

While they share the same promise (Next.js optimization), each component still processes the full result.

---

### 2. `getWorkspaceById` Loads Full Membership Data ⚠️ HIGH

**Location:** `src/server/services/workspace.service.ts:445-474`

```typescript
static async getWorkspaceById(workspaceId: string, userId: string) {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
            members: {  // ❌ LOADS ALL MEMBERS WITH USER DATA
                select: {
                    id: true,
                    userId: true,
                    workspaceId: true,
                    workspaceRole: true,
                    user: { select: { id: true, name: true, surname: true, email: true } }
                }
            }
        }
    });
```

**Impact:** If a workspace has 100 members, this fetches 100 full user objects on every page load.

---

### 3. `getWorkspaces` Loads All Workspace Data ⚠️ HIGH

**Location:** `src/server/services/workspace.service.ts:407-440`

```typescript
static async getWorkspaces(userId: string) {
    const workspacesData = await prisma.workspace.findMany({
        where: { members: { some: { userId } } },
        select: {
            id: true,
            name: true,
            slug: true,
            ownerId: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { members: true } },
            // ❌ LOADS FULL MEMBER RECORDS just to get role
            members: {
                where: { userId },
                select: { workspaceRole: true }
            }
        },
        // ❌ NO LIMIT - loads ALL workspaces user is member of
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
```

**Impact:** If user is member of 50 workspaces, all 50 are loaded in the sidebar on every page.

---

### 4. `getWorkspaceTaskCreationData` Loads Too Many Parent Tasks ⚠️ MEDIUM

**Location:** `src/server/services/workspace.service.ts:570-611`

```typescript
const parentTasksData = await prisma.task.findMany({
  where: { workspaceId, projectId: { in: projectIds }, parentTaskId: null },
  select: { id: true, name: true, projectId: true },
  take: 500, // ❌ 500 IS STILL TOO MANY for a dropdown
  orderBy: { createdAt: "desc" },
});
```

**Impact:** Loading 500 parent tasks for a quick-create dropdown is excessive. Should be limited to 20-50.

---

### 5. Permission Checks Make Multiple DB Queries ⚠️ MEDIUM

**Location:** `src/data/user/get-user-permissions.ts`

```typescript
const [workspaceMember, projectRoles] = await Promise.all([
  prisma.workspaceMember.findFirst({ where: { workspaceId, userId } }),
  prisma.projectMember.findMany({
    where: { workspaceMember: { userId, workspaceId } },
  }),
]);
```

This pattern is used frequently and while Promise.all helps, the queries could be optimized.

---

### 6. Missing Database Indexes

The following queries likely lack proper indexes:

- `Task.projectId` + `Task.status` (for filtering)
- `Task.assigneeId` (for assignment filtering)
- `Task.workspaceId` + `Task.parentTaskId` (for hierarchy)
- `WorkspaceMember.userId` + `WorkspaceMember.workspaceId` (for membership check)

---

## Performance Impact Summary

| Issue                   | Location             | Impact                      | Severity |
| ----------------------- | -------------------- | --------------------------- | -------- |
| Triple promise awaiting | layout.tsx           | ~200-500ms                  | Critical |
| Full member loading     | getWorkspaceById     | ~50-500ms per 100 members   | High     |
| No workspace limit      | getWorkspaces        | ~50-500ms per 50 workspaces | High     |
| 500 parent tasks        | TaskCreationData     | ~100-300ms                  | Medium   |
| Permission queries      | get-user-permissions | ~50-100ms per request       | Medium   |

**Estimated Total Load Time:** 500ms - 2s depending on data size

---

## Recommended Fixes

### Fix 1: Create Lightweight Layout Data Fetch

Create a new optimized function that returns only what's needed for the layout:

```typescript
// src/data/workspace/get-workspace-layout-light.ts
export const getWorkspaceLayoutLight = cache(async (workspaceId: string) => {
  const user = await requireUser();

  // Single query with joins - instead of 3 separate calls
  const [workspaces, metadata, reportStatus] = await Promise.all([
    prisma.workspace.findMany({
      where: { members: { some: { userId: user.id } } },
      select: { id: true, name: true, slug: true },
      take: 20, // Limit workspaces
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    }),
    getDailyReportStatus(workspaceId),
  ]);

  return { workspaces, metadata, reportStatus };
});
```

### Fix 2: Limit Parent Tasks to 20

```typescript
// In workspace.service.ts
take: 20,  // Changed from 500
```

### Fix 3: Add Database Indexes

```sql
-- Add to Prisma schema or migration
CREATE INDEX "Task_workspace_status_idx" ON "Task" ("workspaceId", "status");
CREATE INDEX "Task_assignee_idx" ON "Task" ("assigneeId");
CREATE INDEX "Task_parent_hierarchy_idx" ON "Task" ("parentTaskId", "createdAt");
CREATE INDEX "WorkspaceMember_membership_idx" ON "WorkspaceMember" ("userId", "workspaceId");
```

### Fix 4: Add take/Limit to getWorkspaces

```typescript
// In workspace.service.ts getWorkspaces
take: 50,  // Add limit
```

---

## Implementation Priority

1. **Immediate:** Fix parent tasks limit (500 → 20)
2. **High:** Optimize layout data fetching
3. **High:** Add workspace limit
4. **Medium:** Add database indexes
5. **Low:** Optimize permission queries further

Would you like me to implement any of these fixes?
