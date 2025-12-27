# Actions Cache Invalidation Guide

## Overview

This document provides comprehensive guidelines for implementing cache invalidation in server actions to ensure optimal performance and data consistency across the application.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SERVER ACTIONS                           │
│  (Mutations: Create, Update, Delete)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              CACHE INVALIDATION LAYER                        │
│  src/lib/cache/invalidation.ts                              │
│  - Uses CacheTags from src/data/cache-tags.ts               │
│  - Provides granular invalidation functions                 │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                   CACHED DATA LAYER                          │
│  src/data/**/*.ts                                           │
│  - All data fetching with unstable_cache                    │
│  - Tagged with CacheTags                                    │
└─────────────────────────────────────────────────────────────┘
```

## Performance Best Practices

### ✅ DO: Use Cache Invalidation Functions

```typescript
import { 
  invalidateTaskMutation,
  invalidateProjectTasks,
  invalidateWorkspaceTasks 
} from "@/lib/cache/invalidation";

// ✅ GOOD: Granular invalidation
await invalidateTaskMutation({
  taskId: task.id,
  projectId: task.projectId,
  workspaceId: workspace.id,
  userId: user.id,
  parentTaskId: task.parentTaskId
});
```

### ❌ DON'T: Use revalidatePath

```typescript
// ❌ BAD: Slow, invalidates entire route
revalidatePath(`/w/${workspaceId}/p/${projectSlug}`);

// ❌ BAD: Hardcoded tags
revalidateTag(`project-tasks-${projectId}`);
```

### Performance Comparison

| Method | Speed | Scope | Recommended |
|--------|-------|-------|-------------|
| `invalidateTaskMutation()` | ⚡⚡⚡ Fast | Granular | ✅ Yes |
| `invalidateProjectTasks()` | ⚡⚡ Medium | Project | ✅ Yes |
| `revalidateTag()` | ⚡⚡ Medium | Tag-specific | ⚠️ Use invalidation functions |
| `revalidatePath()` | ⚡ Slow | Entire route | ❌ Avoid |

## Action Categories & Invalidation Patterns

### 1. Task Actions

#### Create Task
```typescript
"use server";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";

export async function createTask(data: TaskData) {
  // 1. Validate permissions
  const permissions = await getUserPermissions(workspaceId, projectId);
  if (!permissions.canCreateTasks) {
    return { status: "error", message: "No permission" };
  }

  // 2. Create task
  const task = await prisma.task.create({ data });

  // 3. Invalidate caches
  await invalidateTaskMutation({
    taskId: task.id,
    projectId: task.projectId,
    workspaceId: workspaceId,
    userId: user.id
  });

  return { status: "success", data: task };
}
```

#### Update Task
```typescript
export async function updateTask(taskId: string, data: TaskData) {
  // 1. Get existing task
  const existingTask = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true }
  });

  // 2. Validate permissions
  const permissions = await getUserPermissions(
    existingTask.project.workspaceId,
    existingTask.projectId
  );

  // 3. Update task
  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data
  });

  // 4. Invalidate caches
  await invalidateTaskMutation({
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    workspaceId: existingTask.project.workspaceId,
    userId: user.id
  });

  return { status: "success" };
}
```

#### Delete Task
```typescript
export async function deleteTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true, subTasks: true }
  });

  // Delete task and subtasks
  await prisma.task.delete({ where: { id: taskId } });

  // Invalidate all related caches
  await invalidateTaskMutation({
    taskId: task.id,
    projectId: task.projectId,
    workspaceId: task.project.workspaceId,
    userId: user.id,
    parentTaskId: task.parentTaskId || undefined
  });

  return { status: "success" };
}
```

### 2. SubTask Actions

#### Create SubTask
```typescript
export async function createSubTask(data: SubTaskData) {
  const subTask = await prisma.task.create({
    data: {
      ...data,
      parentTaskId: data.parentTaskId
    }
  });

  // Invalidate parent task subtasks + project tasks
  await invalidateTaskMutation({
    taskId: subTask.id,
    projectId: subTask.projectId,
    workspaceId: workspaceId,
    userId: user.id,
    parentTaskId: data.parentTaskId // Important!
  });

  return { status: "success", data: subTask };
}
```

#### Update SubTask Status (Kanban)
```typescript
export async function updateSubTaskStatus(
  subTaskId: string,
  newStatus: TaskStatus
) {
  const subTask = await prisma.task.update({
    where: { id: subTaskId },
    data: { status: newStatus },
    include: { project: true }
  });

  // Invalidate subtask caches + Kanban view
  await invalidateTaskSubTasks(subTask.parentTaskId!);
  await invalidateProjectSubTasks(subTask.projectId);
  await invalidateWorkspaceTasks(subTask.project.workspaceId);

  return { status: "success" };
}
```

### 3. Project Actions

#### Create Project
```typescript
export async function createProject(data: ProjectData) {
  const project = await prisma.project.create({ data });

  // Invalidate workspace projects
  await invalidateWorkspaceProjects(data.workspaceId);
  await invalidateUserProjects(user.id, data.workspaceId);

  return { status: "success", data: project };
}
```

#### Update Project
```typescript
export async function updateProject(projectId: string, data: ProjectData) {
  const project = await prisma.project.update({
    where: { id: projectId },
    data
  });

  // Invalidate project data
  await invalidateProject(projectId);
  await invalidateFullProject(projectId);
  await invalidateWorkspaceProjects(project.workspaceId);

  return { status: "success" };
}
```

### 4. Workspace Actions

#### Update Workspace
```typescript
export async function updateWorkspace(
  workspaceId: string,
  data: WorkspaceData
) {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data
  });

  // Invalidate workspace data
  await invalidateWorkspace(workspaceId);
  await invalidateUserWorkspaces(user.id);

  return { status: "success" };
}
```

### 5. Comment Actions

#### Create Comment
```typescript
export async function createComment(taskId: string, content: string) {
  const comment = await prisma.comment.create({
    data: { taskId, content, userId: user.id }
  });

  // Invalidate task comments
  await invalidateTaskComments(taskId);

  return { status: "success", data: comment };
}
```

#### Create Review Comment
```typescript
export async function createReviewComment(
  subTaskId: string,
  content: string
) {
  const comment = await prisma.reviewComment.create({
    data: { subTaskId, content, authorId: user.id }
  });

  // Invalidate review comments
  await invalidateReviewComments(subTaskId);

  return { status: "success", data: comment };
}
```

### 6. Tag Actions

#### Create/Update Tag
```typescript
export async function updateTag(tagId: string, data: TagData) {
  await prisma.tag.update({
    where: { id: tagId },
    data
  });

  // Invalidate workspace tags
  await invalidateWorkspaceTags(data.workspaceId);
  
  // Also invalidate task creation data (includes tags)
  await invalidateWorkspaceTaskCreationData(data.workspaceId, user.id);

  return { status: "success" };
}
```

## Comprehensive Invalidation Functions

### `invalidateTaskMutation()`
**Use for:** Any task create/update/delete operation

```typescript
await invalidateTaskMutation({
  taskId?: string;        // Optional: specific task ID
  projectId: string;      // Required: project ID
  workspaceId: string;    // Required: workspace ID
  userId?: string;        // Optional: user ID for user-specific caches
  parentTaskId?: string;  // Optional: if it's a subtask
});
```

**Invalidates:**
- Task-specific caches
- Project task caches
- Workspace task caches
- Parent task subtasks (if applicable)
- Workspace task creation data

### Individual Invalidation Functions

```typescript
// Workspace
await invalidateWorkspace(workspaceId);
await invalidateUserWorkspaces(userId);
await invalidateWorkspaceMembers(workspaceId);
await invalidateWorkspaceTags(workspaceId);
await invalidateWorkspaceTasks(workspaceId, userId?);

// Project
await invalidateProject(projectId);
await invalidateFullProject(projectId);
await invalidateUserProjects(userId, workspaceId);
await invalidateWorkspaceProjects(workspaceId);
await invalidateProjectMembers(projectId);

// Task
await invalidateTask(taskId);
await invalidateTaskDetails(taskId, projectId);
await invalidateProjectTasks(projectId, userId?);
await invalidateWorkspaceTasks(workspaceId, userId?);

// SubTask
await invalidateSubTask(subTaskId);
await invalidateTaskSubTasks(parentTaskId, workspaceMemberId?);
await invalidateProjectSubTasks(projectId);

// Comments
await invalidateTaskComments(taskId);
await invalidateReviewComments(subTaskId);

// Permissions
await invalidateUserPermissions(userId, workspaceId, projectId?);
```

## Common Patterns

### Pattern 1: Simple Update
```typescript
// Update entity → Invalidate specific cache
await prisma.task.update({ where: { id }, data });
await invalidateTask(id);
```

### Pattern 2: Hierarchical Update
```typescript
// Update affects multiple levels
await prisma.task.update({ where: { id }, data });
await invalidateTaskMutation({
  taskId: id,
  projectId,
  workspaceId,
  userId
});
```

### Pattern 3: Bulk Operations
```typescript
// Multiple updates → Batch invalidation
await prisma.task.updateMany({ where, data });
await invalidateProjectTasks(projectId);
await invalidateWorkspaceTasks(workspaceId);
```

### Pattern 4: Cross-Entity Updates
```typescript
// Update affects multiple entities
await prisma.task.update({ where: { id }, data: { assigneeId } });
await invalidateTask(id);
await invalidateProjectMembers(projectId);
await invalidateWorkspaceTaskCreationData(workspaceId, userId);
```

## Error Handling

```typescript
export async function actionWithErrorHandling(data: Data) {
  try {
    // 1. Validate
    const validation = schema.safeParse(data);
    if (!validation.success) {
      return { status: "error", message: "Invalid data" };
    }

    // 2. Check permissions
    const permissions = await getUserPermissions(workspaceId, projectId);
    if (!permissions.canPerform) {
      return { status: "error", message: "No permission" };
    }

    // 3. Perform mutation
    const result = await prisma.entity.create({ data });

    // 4. Invalidate caches
    await invalidateRelevantCaches();

    return { status: "success", data: result };
  } catch (error) {
    console.error("Action error:", error);
    return { 
      status: "error", 
      message: "Operation failed. Please try again." 
    };
  }
}
```

## Migration Checklist

When updating an existing action:

- [ ] Remove `revalidatePath()` calls
- [ ] Remove hardcoded `revalidateTag()` calls
- [ ] Import invalidation functions from `@/lib/cache/invalidation`
- [ ] Use appropriate invalidation function(s)
- [ ] Include all required IDs (taskId, projectId, workspaceId, userId)
- [ ] Test cache invalidation works correctly
- [ ] Verify performance improvement

## Performance Tips

1. **Use Granular Invalidation**: Only invalidate what changed
2. **Batch Invalidations**: Group related invalidations together
3. **Avoid Path Revalidation**: Use tag-based invalidation instead
4. **Include User ID**: For user-specific cache invalidation
5. **Use Comprehensive Functions**: `invalidateTaskMutation()` handles most cases

## Testing Cache Invalidation

```typescript
// 1. Perform action
const result = await updateTask(taskId, data);

// 2. Verify cache was invalidated
const freshData = await getTaskById(taskId);
expect(freshData.name).toBe(data.name);

// 3. Verify related caches updated
const projectTasks = await getProjectTasks(projectId);
expect(projectTasks.tasks).toContainEqual(
  expect.objectContaining({ id: taskId, name: data.name })
);
```

## Summary

✅ **Always use** invalidation functions from `@/lib/cache/invalidation`  
✅ **Always include** all relevant IDs (workspace, project, user)  
✅ **Always use** `invalidateTaskMutation()` for task operations  
❌ **Never use** `revalidatePath()` in actions  
❌ **Never use** hardcoded tag strings  
❌ **Never forget** to invalidate after mutations  

Following these guidelines ensures **optimal performance** and **data consistency** across your application! 🚀
