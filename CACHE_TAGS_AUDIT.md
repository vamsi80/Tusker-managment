# Cache Tags Audit & Optimization Report

## Executive Summary

Successfully audited and optimized the cache tag system across the entire `/src/data` folder. Created a centralized cache tag management system to eliminate duplicates and ensure consistency.

## Problems Identified

### 1. **Duplicate Tag Definitions**
Multiple files were defining the same cache tags independently:
- `project-tasks-${projectId}` - defined in 4+ files
- `workspace-tasks-${workspaceId}` - defined in 3+ files
- `task-subtasks-${parentTaskId}` - defined in 3+ files
- `workspace-members-${workspaceId}` - defined in 2+ files

### 2. **Inconsistent Tag Patterns**
- Some files used `project-subtasks-${projectId}`
- Others used `task-subtasks-${parentTaskId}`
- No standard naming convention

### 3. **Missing Tag Relationships**
- Tags weren't properly grouped by entity type
- No clear hierarchy or relationship between tags
- Difficult to invalidate related caches

### 4. **Hardcoded Strings**
- All tags were hardcoded strings
- No type safety
- Easy to make typos
- Difficult to refactor

## Solution Implemented

### 1. **Created Centralized Cache Tags System**
**File:** `src/data/cache-tags.ts`

**Features:**
- ✅ Single source of truth for all cache tags
- ✅ Type-safe tag generation functions
- ✅ Consistent naming conventions
- ✅ Documented usage for each tag type
- ✅ Helper functions for combining tags

### 2. **Updated Cache Invalidation**
**File:** `src/lib/cache/invalidation.ts`

**Improvements:**
- ✅ Uses centralized `CacheTags` functions
- ✅ Added new invalidation functions
- ✅ Better parameter support (optional userId, etc.)
- ✅ Comprehensive `invalidateTaskMutation` function

## Cache Tag Categories

### Workspace Tags
```typescript
CacheTags.workspace(workspaceId)
CacheTags.userWorkspaces(userId)
CacheTags.workspaceMembers(workspaceId)
CacheTags.workspaceAdmin(workspaceId)
CacheTags.workspaceTags(workspaceId)
```

### Project Tags
```typescript
CacheTags.project(projectId)
CacheTags.projectBySlug(slug, workspaceId)
CacheTags.fullProject(projectId)
CacheTags.userProjects(userId, workspaceId)
CacheTags.projectMembers(projectId)
CacheTags.projectClient(projectId)
```

### Task Tags
```typescript
CacheTags.task(taskId)
CacheTags.taskDetails(taskId, projectId)
CacheTags.projectTasks(projectId, userId?)
CacheTags.parentTasksOnly(projectId, userId)
CacheTags.workspaceTasks(workspaceId, userId?)
```

### Subtask Tags
```typescript
CacheTags.subtask(subTaskId)
CacheTags.taskSubTasks(parentTaskId, workspaceMemberId?)
CacheTags.projectSubTasks(projectId)
CacheTags.subtasksByStatus(projectId, status, parentTaskId?)
```

### Comment Tags
```typescript
CacheTags.taskComments(taskId)
CacheTags.reviewComments(subTaskId)
```

### Permission Tags
```typescript
CacheTags.userPermissions(userId, workspaceId, projectId?)
CacheTags.adminCheck(userId)
```

### Combined Tags
```typescript
CacheTags.workspaceTaskCreationData(workspaceId, userId)
```

## Tag Usage Patterns

### Before (Inconsistent)
```typescript
// File 1
unstable_cache(
  async () => fetchData(),
  ['key'],
  { tags: [`project-tasks-${projectId}`, `project-tasks-user-${userId}`] }
)

// File 2
unstable_cache(
  async () => fetchData(),
  ['key'],
  { tags: [`project-tasks-${projectId}`, `user-${userId}`] } // Different pattern!
)
```

### After (Consistent)
```typescript
// All files
unstable_cache(
  async () => fetchData(),
  ['key'],
  { tags: CacheTags.projectTasks(projectId, userId) }
)
```

## Files That Need Migration

The following files still use hardcoded tags and should be migrated:

### High Priority
1. `src/data/workspace/get-workspace-task-creation-data.ts` ✅ Already updated
2. `src/data/task/list/get-tasks.ts`
3. `src/data/task/list/get-subtasks.ts`
4. `src/data/task/list/get-parent-tasks-only.ts`
5. `src/data/task/kanban/get-all-subtasks.ts`
6. `src/data/task/kanban/get-subtasks-by-status.ts`

### Medium Priority
7. `src/data/task/get-workspace-tasks.ts`
8. `src/data/task/get-task-by-id.ts`
9. `src/data/project/get-projects.ts`
10. `src/data/project/get-project-by-slug.ts`
11. `src/data/project/get-full-project-data.ts`

### Low Priority
12. `src/data/workspace/get-workspaces.ts`
13. `src/data/workspace/get-workspace-members.ts`
14. `src/data/workspace/get-workspace-by-id.ts`
15. `src/data/project/get-project-members.ts`
16. `src/data/project/clint/get-client.ts`
17. `src/data/comments/get-comments.ts`

## Migration Guide

### Step 1: Import CacheTags
```typescript
import { CacheTags } from '@/data/cache-tags';
```

### Step 2: Replace Hardcoded Tags
```typescript
// Before
unstable_cache(
  async () => fetchData(),
  ['key'],
  {
    tags: [`project-tasks-${projectId}`, `project-tasks-user-${userId}`],
    revalidate: 60
  }
)

// After
unstable_cache(
  async () => fetchData(),
  ['key'],
  {
    tags: CacheTags.projectTasks(projectId, userId),
    revalidate: 60
  }
)
```

### Step 3: Update Invalidation Calls
```typescript
// Before
revalidateTag(`project-tasks-${projectId}`);

// After
import { invalidateProjectTasks } from '@/lib/cache/invalidation';
await invalidateProjectTasks(projectId, userId);
```

## Benefits

### 1. **Consistency**
- All tags follow the same naming convention
- No more duplicate or conflicting tags
- Easy to understand tag relationships

### 2. **Type Safety**
- TypeScript ensures correct tag generation
- Autocomplete for all tag functions
- Compile-time error checking

### 3. **Maintainability**
- Single place to update tag patterns
- Easy to add new tag types
- Clear documentation for each tag

### 4. **Performance**
- Proper tag relationships enable granular invalidation
- No over-invalidation
- Better cache hit rates

### 5. **Developer Experience**
- Clear API for cache tags
- Helper functions for common patterns
- Comprehensive invalidation functions

## Recommended Next Steps

1. **Migrate High Priority Files** (Week 1)
   - Update all task-related data fetching files
   - Test cache invalidation thoroughly

2. **Migrate Medium Priority Files** (Week 2)
   - Update project and workspace data files
   - Verify no regressions

3. **Migrate Low Priority Files** (Week 3)
   - Update remaining files
   - Remove any old tag patterns

4. **Add Tests** (Week 4)
   - Test cache invalidation flows
   - Verify tag relationships
   - Performance testing

5. **Documentation** (Ongoing)
   - Update developer docs
   - Add examples for common patterns
   - Create troubleshooting guide

## Example: Comprehensive Task Mutation

```typescript
import { invalidateTaskMutation } from '@/lib/cache/invalidation';

// When creating/updating/deleting a task
await invalidateTaskMutation({
  taskId: 'task-123',
  projectId: 'proj-456',
  workspaceId: 'ws-789',
  userId: 'user-001',
  parentTaskId: 'parent-task-111' // if it's a subtask
});

// This automatically invalidates:
// - Task-specific caches
// - Project task caches
// - Workspace task caches
// - Parent task subtasks
// - Workspace task creation data
```

## Conclusion

The centralized cache tag system provides:
- ✅ **Consistency** across the entire codebase
- ✅ **Type Safety** with TypeScript
- ✅ **Better Performance** with proper invalidation
- ✅ **Easier Maintenance** with single source of truth
- ✅ **Developer Friendly** with clear API

All new code should use `CacheTags` functions, and existing code should be migrated progressively.
