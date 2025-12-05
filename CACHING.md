# Caching Implementation

## Overview
Implemented a multi-layer caching strategy for user projects, workspaces, admin checks, **tasks, subtasks, and project members** to significantly improve page load performance.

## Caching Layers

### 1. React Cache (Request Deduplication)
- Uses `cache()` from React
- Deduplicates identical requests **within the same render**
- Prevents multiple database queries in a single page render

### 2. Next.js Data Cache (Persistent Cache)
- Uses `unstable_cache()` from Next.js
- Caches data **across requests** for configurable duration
- Tagged for targeted invalidation

### 3. Prisma $transaction (Query Optimization)
- Combines count + data queries into single DB round-trip
- Reduces database calls by 50% for paginated endpoints

## Cached Data

### User Projects
- **Function**: `getUserProjects(workspaceId)`
- **Tags**: 
  - `user-projects-{userId}`
  - `workspace-projects-{workspaceId}`
- **Revalidation**: 60 seconds

### User Workspaces
- **Function**: `getUserWorkspaces(userId)`
- **Tags**: 
  - `user-workspaces-{userId}`
- **Revalidation**: 24 hours

### Admin Checks
- **Function**: `requireAdmin(workspaceId)`
- **Tags**: 
  - `admin-check-{userId}`
  - `workspace-admin-{workspaceId}`
- **Revalidation**: 24 hours

### Project Tasks ⭐ NEW
- **Function**: `getProjectTasks(projectId, page, pageSize)`
- **Tags**: 
  - `project-tasks-{projectId}`
  - `project-tasks-all`
- **Revalidation**: 60 seconds
- **Optimization**: Uses `$transaction` for count + data queries

### Task Subtasks ⭐ NEW
- **Function**: `getTaskSubTasks(parentTaskId, page, pageSize)`
- **Tags**: 
  - `task-subtasks-{parentTaskId}`
  - `task-subtasks-all`
- **Revalidation**: 60 seconds
- **Optimization**: Uses `$transaction` for count + data queries

### Project Members ⭐ NEW
- **Function**: `getProjectMembers(projectId)`
- **Tags**: 
  - `project-members-{projectId}`
- **Revalidation**: 5 minutes

## Cache Invalidation

### Automatic Revalidation
- Task cache revalidates every **60 seconds**
- Project members cache revalidates every **5 minutes**

### Manual Invalidation
Use the helper functions in `invalidate-project-cache.ts`:

```typescript
// Invalidate user projects
invalidateUserProjects(userId);

// Invalidate workspace projects
invalidateWorkspaceProjects(workspaceId);

// Invalidate both
invalidateProjectCaches(userId, workspaceId);

// Invalidate user workspaces
invalidateUserWorkspaces(userId);

// Invalidate admin check for a user
invalidateAdminCheck(userId);

// Invalidate admin checks for entire workspace
invalidateWorkspaceAdminChecks(workspaceId);

// ⭐ NEW: Task cache invalidation
invalidateProjectTasks(projectId);     // Invalidate project's tasks
invalidateAllProjectTasks();           // Invalidate all tasks (use sparingly)

// ⭐ NEW: Subtask cache invalidation
invalidateTaskSubTasks(parentTaskId);  // Invalidate specific task's subtasks
invalidateAllTaskSubTasks();           // Invalidate all subtasks (use sparingly)

// ⭐ NEW: Project members cache invalidation
invalidateProjectMembers(projectId);   // Invalidate project members
```

### When Cache is Invalidated
- ✅ **Task creation** - invalidates project tasks cache
- ✅ **Task update** - invalidates project tasks cache
- ✅ **Task deletion** - invalidates project tasks cache
- ✅ **Subtask creation** - invalidates project tasks + parent task subtasks cache
- ✅ **Subtask update** - invalidates project tasks + parent task subtasks cache
- ✅ **Subtask deletion** - invalidates project tasks + parent task subtasks cache
- ✅ **Project creation** - invalidates workspace projects cache
- ✅ **User invitation** - invalidates new user's workspaces cache

## Performance Benefits

1. **First Load**: Database query (slower)
2. **Subsequent Loads**: Cached data (instant)
3. **Multiple Components**: Single query per render (deduplicated)
4. **Fresh Data**: Auto-revalidates at configured intervals
5. **Permission Checks**: Admin checks are cached
6. **Reduced DB Calls**: `$transaction` combines count + data queries

## Query Optimization: $transaction

Before (2 DB round trips):
```typescript
const totalCount = await prisma.task.count({ ... });  // Query 1
const tasks = await prisma.task.findMany({ ... });    // Query 2
```

After (1 DB round trip):
```typescript
const [totalCount, tasks] = await prisma.$transaction([
    prisma.task.count({ ... }),
    prisma.task.findMany({ ... }),
]);
```

**Result**: 50% fewer database round trips for paginated queries!

## Usage Examples

```typescript
// Get project tasks (cached)
const tasks = await getProjectTasks(projectId, 1, 10);

// Get subtasks (cached)
const subtasks = await getTaskSubTasks(parentTaskId, 1, 10);

// Get project members (cached)
const members = await getProjectMembers(projectId);

// After creating a task, invalidate cache
await createTask(data);
await invalidateProjectTasks(projectId);

// After creating a subtask, invalidate caches
await createSubTask(data);
await invalidateProjectTasks(projectId);
await invalidateTaskSubTasks(parentTaskId);
```

## Files Modified

- `src/app/data/task/get-project-tasks.ts` - Task/subtask caching with $transaction
- `src/app/data/project/get-project-members.ts` - Project members caching
- `src/app/data/user/get-user-projects.ts` - User projects caching
- `src/app/data/workspace/get-user-workspace.ts` - User workspaces caching
- `src/app/data/workspace/requireAdmin.ts` - Admin permission caching
- `src/app/data/user/invalidate-project-cache.ts` - Cache invalidation utilities
- `src/app/w/[workspaceId]/p/[slug]/task/action.ts` - Task/subtask CRUD with cache invalidation
