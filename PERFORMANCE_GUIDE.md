# 🚀 Tusker Management Performance & Caching Architecture

This document outlines the comprehensive multi-layer caching strategy and performance optimizations implemented to achieve "ClickUp-speed" performance. Every developer should follow these patterns when adding new features.

---

## 📊 Performance Architecture Overview

| Layer | Technology | Purpose | UI Latency |
| :--- | :--- | :--- | :--- |
| **1. Browser** | React `useTransition` + Optimistic UI | Instant feedback before server response | **0ms** |
| **2. Request** | React `cache()` | Deduplicate queries in one render pass | **5ms** |
| **3. Persistent** | `unstable_cache` | Shared cache across users/sessions | **20-50ms** |
| **4. Database** | Prisma Indexes | Fast lookups on large tables | **1-10ms** |
| **5. API Layer** | Route Handlers + Cache Headers | Client-side pagination & filtering | **<100ms** |

---

## 🟢 Level 1: Browser-Side (Optimistic UI)

**The Golden Rule:** Don't wait for the server. Assume success and update UI immediately.

### Implementation Patterns

#### 1. Using `useTransition` with Optimistic Updates
```typescript
// From: src/components/task/list/inline-subtask-form.tsx
const [pending, startTransition] = useTransition();

const handleSubmit = async (e) => {
    // 1. Create optimistic data
    const tempId = `temp-${Date.now()}`;
    const optimisticSubTask = {
        id: tempId,
        name: subTaskName.trim(),
        status,
        isOptimistic: true, // Tag for potential UI treatment
    };

    // 2. Update UI immediately
    onSubTaskCreated?.(optimisticSubTask);
    onCancel(); // Close form immediately

    // 3. Run server action in background
    startTransition(async () => {
        const result = await createSubTask(data);
        
        if (result.status !== "success") {
            // 4. Rollback on failure
            onSubTaskDeleted?.(tempId);
            toast.error("Failed to create subtask");
            return;
        }
        
        // 5. Replace optimistic with real data
        onSubTaskCreated?.(result.data, tempId);
        toast.success("Subtask created");
    });
};
```

#### 2. Components Using Optimistic UI
- `InlineSubTaskForm` - Create/Edit subtasks inline
- `InlineTaskForm` - Create/Edit tasks inline
- `GanttChart` - Drag & drop task updates
- `DraggableSubtaskBar` - Task duration changes
- `KanbanBoard` - Card movements

---

## 🟡 Level 2: Request Memoization

**The Golden Rule:** Never fetch the same data twice in one page load.

### Implementation Pattern

All data-fetching functions in `src/data/` are wrapped with React's `cache()`:

```typescript
// From: src/data/task/get-task-page-data.ts
import { cache } from "react";

export const getTaskPageData = cache(
    async (workspaceId: string, slug?: string) => {
        const user = await requireUser();
        const userProjects = await getUserProjects(workspaceId);
        
        // Even if 10 components call this, it only runs once per render
        // ...
    }
);
```

### Cached Data Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `getTaskPageData` | `src/data/task/get-task-page-data.ts` | Unified project/workspace page data |
| `getParentTasksOnly` | `src/data/task/list/get-parent-tasks-only.ts` | Paginated parent tasks |
| `getSubTasks` | `src/data/task/list/get-subtasks.ts` | Paginated subtasks |
| `getSubTasksByStatus` | `src/data/task/kanban/get-subtasks-by-status.ts` | Kanban columns |
| `getWorkspaceById` | `src/data/workspace/get-workspace-by-id.ts` | Workspace details |
| `getProjectBySlug` | `src/data/project/get-project-by-slug.ts` | Project lookup |
| `getUserPermissions` | `src/data/user/get-user-permissions.ts` | Permission checks |
| `getWorkspacePermissions` | `src/data/user/get-user-permissions.ts` | Workspace-level permissions |
| `getWorkspaceTaskCreationData` | `src/data/workspace/get-workspace-task-creation-data.ts` | Form dropdown data |

---

## 🟠 Level 3: Persistent Data Cache

**The Golden Rule:** Surgical invalidation. Never clear the whole cache.

### Implementation Pattern (3-Layer Data Function)

```typescript
// From: src/data/task/list/get-parent-tasks-only.ts

/**
 * 1. Internal DB Query (Private)
 */
async function _getParentTasksOnlyInternal(
    projectId: string,
    workspaceId: string,
    userId: string,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) {
    return prisma.task.findMany({
        where: { projectId, parentTaskId: null },
        // ... optimized selects
    });
}

/**
 * 2. Cached Version (Cross-request)
 */
const getCachedParentTasksOnly = (projectId, workspaceId, userId, ...) =>
    unstable_cache(
        async () => _getParentTasksOnlyInternal(...),
        [`project-parent-tasks-${projectId}-user-${userId}-page-${page}`],
        {
            tags: CacheTags.parentTasksOnly(projectId, userId),
            revalidate: 60, // 1 minute
        }
    )();

/**
 * 3. Public API (Request Memoized + Auth)
 */
export const getParentTasksOnly = cache(
    async (projectId, workspaceId, page = 1, pageSize = 10) => {
        const user = await requireUser(); // Auth Check
        const permissions = await getUserPermissions(workspaceId, projectId);
        return await getCachedParentTasksOnly(...);
    }
);
```

### Centralized Cache Tags

All cache tags are centralized in `src/data/cache-tags.ts`:

```typescript
export const CacheTags = {
    // Workspace Tags
    workspace: (id) => [`workspace-${id}`],
    userWorkspaces: (userId) => [`user-workspaces-${userId}`, 'workspaces'],
    workspaceMembers: (id) => [`workspace-members-${id}`],
    workspaceTags: (id) => [`workspace-tags-${id}`],
    
    // Project Tags
    project: (id) => [`project-${id}`],
    projectBySlug: (slug, workspaceId) => [`project-${slug}`, `workspace-${workspaceId}-projects`],
    projectMembers: (id) => [`project-members-${id}`],
    projectClient: (id) => [`project-client-${id}`, `project-${id}`],
    
    // Task Tags
    task: (id) => [`task-${id}`],
    taskDetails: (taskId, projectId) => [`task-${taskId}`, `project-tasks-${projectId}`, 'task-details'],
    projectTasks: (projectId, userId?) => { /* ... */ },
    parentTasksOnly: (projectId, userId) => [`project-tasks-${projectId}`, `project-tasks-user-${userId}`, 'parent-tasks-only'],
    workspaceTasks: (workspaceId, userId?) => { /* ... */ },
    
    // Subtask Tags
    subtask: (id) => [`subtask-${id}`],
    taskSubTasks: (parentTaskId, workspaceMemberId?) => { /* ... */ },
    projectSubTasks: (projectId) => [`project-tasks-${projectId}`, `project-subtasks-${projectId}`],
    subtasksByStatus: (projectId, status, parentTaskId?) => { /* ... */ },
    
    // Comment Tags
    taskComments: (taskId) => [`task-comments-${taskId}`, `task-${taskId}`],
    reviewComments: (subTaskId) => [`review-comments-${subTaskId}`, `subtask-${subTaskId}`],
    
    // Combined Tags
    workspaceTaskCreationData: (workspaceId, userId) => [`workspace-task-creation-data-${workspaceId}-${userId}`, `workspace-tasks-${workspaceId}`],
};
```

### Centralized Cache Invalidation

All invalidation functions are in `src/lib/cache/invalidation.ts`:

```typescript
// Comprehensive invalidation for task mutations
export async function invalidateTaskMutation(params: {
    taskId?: string;
    projectId: string;
    workspaceId: string;
    userId?: string;
    parentTaskId?: string;
}) {
    const { taskId, projectId, workspaceId, userId, parentTaskId } = params;

    const invalidations: Promise<void>[] = [];

    // Invalidate task-specific caches
    if (taskId) {
        invalidations.push(invalidateTask(taskId));
        invalidations.push(invalidateTaskDetails(taskId, projectId));
    }

    // Invalidate project and workspace caches
    invalidations.push(invalidateTaskCaches(projectId, workspaceId, userId));

    // Invalidate parent task subtasks if applicable
    if (parentTaskId) {
        invalidations.push(invalidateTaskSubTasks(parentTaskId));
    }

    // Parallel execution for speed
    await Promise.all(invalidations);
}
```

### Available Invalidation Functions

| Function | When to Use |
|----------|-------------|
| `invalidateTaskMutation` | Any task create/update/delete |
| `invalidateProjectTasks` | Project-level task list changes |
| `invalidateWorkspaceTasks` | Workspace-level task changes |
| `invalidateTaskSubTasks` | Subtask list under a parent |
| `invalidateSubTask` | Single subtask update |
| `invalidateProjectMembers` | Member assignment changes |
| `invalidateWorkspaceTags` | Tag create/update/delete |
| `invalidateWorkspaceTaskCreationData` | Form dropdown data changes |

---

## 🔴 Level 4: Database Indexing

**The Golden Rule:** No `@index`, no query. Every filtered/sorted field needs an index.

### Current Task Model Indexes (schema.prisma)

```prisma
model Task {
  // ... fields
  
  @@index([parentTaskId])           // Subtask lists
  @@index([projectId])              // Project filtering
  @@index([projectId, parentTaskId]) // Parent tasks in project
  @@index([projectId, status])      // Kanban/Filter views
  @@index([status, createdAt])      // Status timeline
  @@index([createdById])            // Created by user
  @@index([assigneeTo])             // "My Tasks" view
  @@index([isPinned])               // Pinned tasks
  @@index([position])               // Drag & drop sorting
  @@index([tagId])                  // Tag filtering
}
```

### Other Critical Indexes

```prisma
model WorkspaceMember {
  @@index([workspaceId, workspaceRole])
  @@index([workspaceId])
  @@index([userId])
  @@index([workspaceId, userId])
  @@index([workspaceRole])
}

model ProjectMember {
  @@index([projectId, projectRole])
  @@index([projectId])
  @@index([workspaceMemberId])
  @@index([projectId, workspaceMemberId])
}

model Project {
  @@index([workspaceId])
  @@index([workspaceId, createdAt])
  @@index([slug])
}

model Comment {
  @@index([taskId])
  @@index([userId])
  @@index([parentCommentId])
  @@index([createdAt])
}

model ReviewComment {
  @@index([subTaskId, createdAt])
}

model AuditLog {
  @@index([entityId])
  @@index([entityType])
  @@index([action])
  @@index([projectId])
  @@index([userId])
  @@index([timestamp])
  @@index([operationId])
}
```

---

## 🚄 Level 5: API-First Interactivity

**The Golden Rule:** Server Components for initial load, API Routes for client-side interactions.

### API Route Pattern

```typescript
// From: src/app/api/w/[workspaceId]/p/[slug]/tasks/route.ts
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ workspaceId: string; slug: string }> }
) {
    const { workspaceId } = await params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");

    const result = await getParentTasksOnly(projectId, workspaceId, page, pageSize);

    return NextResponse.json(result, {
        headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
        },
    });
}
```

### Available API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/w/[workspaceId]/p/[slug]/tasks` | GET | Paginated parent tasks |
| `/api/w/[workspaceId]/p/[slug]/subtasks` | GET | Paginated subtasks |
| `/api/kanban/move` | POST | Move card between columns |
| `/api/kanban/pin` | POST | Pin/unpin task |

### Client-Side Fetching Pattern

```typescript
// Example: Load more tasks
const loadMoreTasks = async () => {
    const response = await fetch(
        `/api/w/${workspaceId}/p/${slug}/tasks?projectId=${projectId}&page=${nextPage}&pageSize=10`
    );
    const data = await response.json();
    setTasks(prev => [...prev, ...data.tasks]);
    setHasMore(data.hasMore);
};
```

---

## 📁 File Organization

### Data Layer (`src/data/`)

```
src/data/
├── cache-tags.ts              # Centralized cache tag definitions
├── task/
│   ├── index.ts               # Public exports
│   ├── get-task-page-data.ts  # Unified page data
│   ├── get-task-by-id.ts      # Single task lookup
│   ├── get-workspace-tasks.ts # Workspace-level tasks
│   ├── revalidate-task-data.ts # View-specific revalidation
│   ├── list/
│   │   ├── get-parent-tasks-only.ts  # List view - parent tasks
│   │   ├── get-subtasks.ts           # List view - subtasks
│   │   └── get-tasks.ts              # Combined task queries
│   ├── kanban/
│   │   ├── get-all-subtasks.ts       # All subtasks (no pagination)
│   │   ├── get-subtasks-by-status.ts # Per-column pagination
│   │   └── index.ts
│   └── gantt/
│       └── get-all-tasks-flat.ts     # Flat task structure for Gantt
├── project/
│   ├── get-project-by-slug.ts
│   ├── get-project-members.ts
│   ├── get-projects.ts
│   └── get-full-project-data.ts
├── workspace/
│   ├── get-workspace-by-id.ts
│   ├── get-workspace-members.ts
│   ├── get-workspace-task-creation-data.ts
│   └── get-workspaces.ts
├── user/
│   └── get-user-permissions.ts
├── tag/
│   └── get-tags.ts
└── comments/
    └── ...
```

### Cache Invalidation (`src/lib/cache/`)

```
src/lib/cache/
└── invalidation.ts  # All invalidation functions
```

---

## 🛠️ Best Practices Summary

### ✅ DO

1. **Always use `cache()` wrapper** for public data functions
2. **Use `unstable_cache()` with granular tags** for cross-request caching
3. **Implement optimistic UI** for all user actions
4. **Use `Promise.all()`** for parallel data fetching
5. **Use `$transaction`** for count + data queries
6. **Add indexes** for any new `where` or `orderBy` field
7. **Call centralized invalidation functions** after mutations
8. **Use API routes** for client-side pagination/filtering
9. **Set Cache-Control headers** on API responses

### ❌ DON'T

1. **Don't call `revalidateTag()` directly** - use invalidation functions
2. **Don't fetch the same data multiple times** in one render
3. **Don't use broad cache tags** like `['tasks']` - be specific
4. **Don't wait for server response** before updating UI
5. **Don't over-fetch relations** - only select what's needed
6. **Don't skip indexes** for frequently queried fields
7. **Don't use `router.refresh()`** - use targeted revalidation

---

## 📊 Performance Monitoring

### Browser Network Tab Checks

| Indicator | Healthy | Problem |
|-----------|---------|---------|
| TTFB (Green Bar) | < 500ms | Cache miss or missing index |
| Content Download (Blue Bar) | < 1MB | Over-fetching relations |
| Request Count | < 5 per page | Missing request memoization |

### Common Performance Issues

1. **Slow initial load**: Check Level 3 & 4 (caching + indexes)
2. **Sluggish interactions**: Check Level 1 (optimistic UI)
3. **Duplicate requests**: Check Level 2 (`cache()` wrapper)
4. **Large payloads**: Reduce `include`/`select` in Prisma queries

---

## 🔄 View-Specific Revalidation

Use `revalidateTaskData()` for targeted cache invalidation by view:

```typescript
// From: src/data/task/revalidate-task-data.ts
export async function revalidateTaskData(
    projectId: string,
    userId: string,
    view: 'list' | 'kanban' | 'gantt' | 'all' = 'all'
) {
    switch (view) {
        case 'list':
            revalidateTag(`project-tasks-${projectId}`);
            revalidateTag(`project-tasks-user-${userId}`);
            break;
        case 'kanban':
            revalidateTag(`project-tasks-${projectId}`);
            revalidateTag(`task-subtasks-all`);
            break;
        case 'gantt':
            revalidateTag(`project-tasks-${projectId}`);
            revalidateTag(`task-subtasks-all`);
            break;
        case 'all':
        default:
            // Invalidate everything
            revalidateTag(`project-tasks-${projectId}`);
            revalidateTag(`project-tasks-user-${userId}`);
            revalidateTag(`project-tasks-all`);
            revalidateTag(`task-subtasks-all`);
            break;
    }
}
```

---

## 📈 Cache Revalidation Times

| Data Type | TTL | Reason |
|-----------|-----|--------|
| Workspace | 24 hours | Rarely changes |
| Project | 1 minute | Moderate change frequency |
| Tasks | 1 minute | Frequent updates |
| Subtasks | 1 minute | Frequent updates |
| Kanban columns | 30 seconds | Real-time feel needed |
| Task creation data | 5 minutes | Form dropdowns |
| Permissions | Request-only | Security critical |

---

*Last updated: December 29, 2025*
