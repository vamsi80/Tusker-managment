# Workspace-Level Task System Architecture

## Overview

This document outlines the architecture for workspace-level centralized task views (List, Kanban, Gantt) that show all tasks across all projects in a workspace, while maintaining complete separation from existing project-level functionality.

## Core Principles

1. **Additive, Not Disruptive**: Workspace views complement project views without modifying existing code
2. **Single Source of Truth**: One API endpoint, one data fetch, multiple view transformations
3. **Lazy Loading**: Subtasks loaded only when expanded
4. **Proper Cache Invalidation**: Mutations invalidate both project and workspace caches
5. **Permission-Based Filtering**: Workspace admins see all, members see only their projects

---

## Data Layer Architecture

### 1. Single Workspace API Endpoint

**Location**: `src/data/task/get-workspace-tasks.ts`

**Purpose**: Fetch all tasks across all projects in a workspace with filtering support

**Key Features**:
- Filters by: `status`, `projectId`, `assigneeId`, `dateRange`, `tag`
- Permission-aware: Admins see all, members see only accessible projects
- Returns parent tasks WITHOUT subtasks (lazy-loaded separately)
- Optimized Prisma query with proper indexes

**Prisma Query Strategy**:
```typescript
// 1. Get accessible projects based on role
const projects = await prisma.project.findMany({
  where: {
    workspaceId,
    ...(isMember ? { members: { some: { workspaceMemberId } } } : {})
  }
});

// 2. Fetch parent tasks with filters
const tasks = await prisma.task.findMany({
  where: {
    projectId: { in: projectIds },
    parentTaskId: null,
    // Apply filters: status, assigneeId, dateRange, tag
  },
  select: {
    // Minimal fields for performance
    id, name, status, projectId, assignee, project, etc.
    // NO subTasks here - lazy loaded
  }
});
```

### 2. Cache Key Strategy

#### Workspace-Level Cache Keys
```typescript
// Primary cache key with filters
[`workspace-tasks-${workspaceId}-user-${userId}-filters-${filterHash}`]

// Cache tags for invalidation
tags: [
  `workspace-tasks-${workspaceId}`,
  `workspace-tasks-user-${userId}`,
  `workspace-tasks-all`
]
```

#### Project-Level Cache Keys (Existing - DO NOT MODIFY)
```typescript
// Project tasks
[`project-tasks-${projectId}-user-${userId}-page-${page}`]
tags: [`project-tasks-${projectId}`, `project-tasks-user-${userId}`]

// Subtasks
[`task-subtasks-${parentTaskId}-member-${workspaceMemberId}`]
tags: [`task-subtasks-${parentTaskId}`, `task-subtasks-all`]
```

### 3. Cache Invalidation Rules

**On Task Mutation** (create/update/delete):
```typescript
// Invalidate BOTH project and workspace caches
await invalidateProjectTasks(projectId);
await invalidateWorkspaceTasks(workspaceId);
```

**On Subtask Mutation**:
```typescript
// Invalidate parent task, project, and workspace
await invalidateTaskSubTasks(parentTaskId);
await invalidateProjectTasks(projectId);
await invalidateWorkspaceTasks(workspaceId);
```

**Implementation**: Update `src/lib/cache/invalidation.ts` with new workspace invalidation functions

---

## API Layer

### Workspace Tasks API

**Endpoint**: `GET /api/workspaces/{workspaceId}/tasks`

**Query Parameters**:
- `status`: Filter by task status (TO_DO, IN_PROGRESS, etc.)
- `projectId`: Filter by specific project
- `assigneeId`: Filter by assignee user ID
- `startDate`: Filter tasks starting after this date
- `endDate`: Filter tasks ending before this date
- `tag`: Filter by task tag (DESIGN, PROCUREMENT, CONTRACTOR)

**Response**:
```typescript
{
  tasks: Task[],
  totalCount: number,
  filters: AppliedFilters
}
```

**Permissions**:
- Validates workspace membership
- Workspace ADMIN/OWNER: All tasks from all projects
- Workspace MEMBER: Only tasks from projects they belong to

**No Separate APIs for Views**: List, Kanban, and Gantt all use this single endpoint

---

## Client Layer

### 1. Shared Data Hook

**Location**: `src/hooks/use-workspace-tasks.ts`

**Purpose**: Single hook that fetches workspace tasks and is reused by all views

```typescript
export function useWorkspaceTasks(workspaceId: string, filters?: TaskFilters) {
  // Fetch once, cache in React Query
  const { data, isLoading, error } = useQuery({
    queryKey: ['workspace-tasks', workspaceId, filters],
    queryFn: () => getWorkspaceTasks(workspaceId, filters),
    staleTime: 60000, // 1 minute
  });

  return {
    tasks: data?.tasks ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error,
  };
}
```

### 2. View-Specific Transformations

Each view transforms the same data differently:

#### List View
```typescript
// No transformation needed - display tasks as-is
<WorkspaceTaskTable tasks={tasks} />
```

#### Kanban View
```typescript
// Group by status (client-side)
const tasksByStatus = useMemo(() => {
  return groupBy(tasks, 'status');
}, [tasks]);

<KanbanBoard columns={tasksByStatus} />
```

#### Gantt View
```typescript
// Map to Gantt format (client-side)
const ganttTasks = useMemo(() => {
  return tasks.map(task => ({
    id: task.id,
    name: task.name,
    start: task.startDate,
    end: addDays(task.startDate, task.days),
    // ... other Gantt properties
  }));
}, [tasks]);

<GanttChart tasks={ganttTasks} />
```

### 3. Lazy-Loading Subtasks

**When**: User expands a parent task in List view or clicks on task in Kanban/Gantt

**How**: Use existing `getTaskSubTasks` function (DO NOT MODIFY)

```typescript
const loadSubtasks = async (parentTaskId: string) => {
  const subtasks = await getTaskSubTasks(
    parentTaskId,
    workspaceId,
    projectId,
    page,
    pageSize
  );
  // Update local state
};
```

---

## Permissions & Security

### Workspace-Level Permissions

```typescript
// In get-workspace-tasks.ts
const workspaceMember = await prisma.workspaceMember.findFirst({
  where: { workspaceId, userId }
});

const isAdmin = ['ADMIN', 'OWNER'].includes(workspaceMember.workspaceRole);

// Filter projects based on role
const projects = await prisma.project.findMany({
  where: {
    workspaceId,
    ...(isAdmin ? {} : {
      members: {
        some: { workspaceMemberId: workspaceMember.id }
      }
    })
  }
});
```

### API Route Validation

```typescript
// In API route
const session = await requireUser();

// Validate workspace membership
const member = await prisma.workspaceMember.findFirst({
  where: { workspaceId, userId: session.id }
});

if (!member) {
  return new Response('Unauthorized', { status: 403 });
}
```

---

## Database Indexes

### Existing Indexes (Already in schema.prisma)
```prisma
model Task {
  @@index([parentTaskId])
  @@index([projectId])
  @@index([createdById])
  @@index([assigneeTo])
  @@index([isPinned])
}
```

### Recommended Additional Indexes
```prisma
model Task {
  // Composite index for workspace queries
  @@index([projectId, parentTaskId, status])
  
  // Index for date range filtering
  @@index([startDate])
  
  // Index for tag filtering
  @@index([tag])
}
```

**Note**: Add these indexes via Prisma migration for optimal performance

---

## File Structure

```
src/
├── data/
│   └── task/
│       ├── get-workspace-tasks.ts          # NEW: Workspace data layer
│       ├── get-workspace-all-tasks.ts      # EXISTING: Keep for backward compatibility
│       ├── get-project-tasks.ts            # EXISTING: DO NOT MODIFY
│       └── revalidate-task-data.ts         # UPDATE: Add workspace invalidation
│
├── lib/
│   └── cache/
│       └── invalidation.ts                 # UPDATE: Add workspace cache functions
│
├── hooks/
│   └── use-workspace-tasks.ts              # NEW: Shared data hook
│
├── app/
│   └── w/
│       └── [workspaceId]/
│           └── tasks/
│               └── _components/
│                   ├── views/
│                   │   ├── workspace-list-view.tsx      # UPDATE: Use new hook
│                   │   ├── workspace-kanban-view.tsx    # UPDATE: Use new hook
│                   │   └── workspace-gantt-view.tsx     # UPDATE: Use new hook
│                   └── workspace-task-filters.tsx       # EXISTING: Client-side filters
│
└── actions/
    └── task/
        ├── create-task.ts                  # UPDATE: Invalidate workspace cache
        ├── update-task.ts                  # UPDATE: Invalidate workspace cache
        ├── delete-task.ts                  # UPDATE: Invalidate workspace cache
        ├── create-subTask.ts               # UPDATE: Invalidate workspace cache
        ├── update-subTask.ts               # UPDATE: Invalidate workspace cache
        └── delete-subTask.ts               # UPDATE: Invalidate workspace cache
```

---

## Implementation Checklist

### Phase 1: Data Layer
- [ ] Create `get-workspace-tasks.ts` with filtering support
- [ ] Add workspace cache invalidation functions to `invalidation.ts`
- [ ] Update `revalidate-task-data.ts` with workspace tags

### Phase 2: Cache Invalidation
- [ ] Update all task mutation actions to invalidate workspace cache
- [ ] Test cache invalidation across project and workspace views

### Phase 3: Client Layer
- [ ] Create `use-workspace-tasks.ts` hook
- [ ] Update List view to use new hook
- [ ] Update Kanban view to use new hook with grouping
- [ ] Update Gantt view to use new hook with date mapping

### Phase 4: Testing & Optimization
- [ ] Test with large datasets (1000+ tasks)
- [ ] Verify lazy-loading of subtasks
- [ ] Ensure cache invalidation works correctly
- [ ] Add database indexes if needed

---

## Performance Considerations

### 1. Query Optimization
- Fetch only necessary fields (avoid `include` for unused relations)
- Use composite indexes for multi-field filtering
- Limit initial data fetch (no subtasks)

### 2. Client-Side Performance
- Memoize view transformations
- Virtualize long lists (react-window)
- Debounce filter changes

### 3. Caching Strategy
- 60-second stale time for workspace data
- Instant invalidation on mutations
- Separate cache keys per filter combination

---

## Migration from Current Implementation

Your current `get-workspace-all-tasks.ts` fetches ALL subtasks eagerly. This is inefficient.

### Current Issues:
1. ❌ Fetches all subtasks upfront (slow for large projects)
2. ❌ No filtering support
3. ❌ No cache invalidation on mutations

### New Approach:
1. ✅ Fetch only parent tasks initially
2. ✅ Lazy-load subtasks on demand
3. ✅ Support comprehensive filtering
4. ✅ Proper cache invalidation

### Migration Path:
1. Keep `get-workspace-all-tasks.ts` for backward compatibility
2. Create new `get-workspace-tasks.ts` with optimized approach
3. Update views to use new function
4. Deprecate old function after migration

---

## Conclusion

This architecture provides:
- ✅ **Scalability**: Handles large task counts efficiently
- ✅ **Maintainability**: Clear separation between project and workspace logic
- ✅ **Performance**: Single fetch, lazy subtasks, proper caching
- ✅ **Flexibility**: Easy to add new filters or views
- ✅ **Security**: Permission-based data access

The workspace view is truly **additive** - it enhances the system without disrupting existing project-level functionality.
