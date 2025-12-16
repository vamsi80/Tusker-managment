# Task Data Functions - Nested Structure

## Overview

The task data functions have been refactored to properly handle the nested task/subtask relationship. The database uses a **single `Task` table** with a self-referential relationship:

- **Parent Tasks**: `parentTaskId = null`
- **Subtasks**: `parentTaskId` points to their parent task

## Available Functions

### 1. `getTasks()` - Hierarchical Structure ⭐ **RECOMMENDED**

Returns parent tasks with nested subtasks in a hierarchical structure.

```typescript
import { getTasks } from "@/data/task";

const { tasks } = await getTasks(projectId, workspaceId);

// Structure:
// tasks = [
//   {
//     id: "parent-1",
//     name: "Parent Task 1",
//     parentTaskId: null,
//     subTasks: [
//       { id: "sub-1", name: "Subtask 1", parentTaskId: "parent-1" },
//       { id: "sub-2", name: "Subtask 2", parentTaskId: "parent-1" }
//     ]
//   },
//   {
//     id: "parent-2",
//     name: "Parent Task 2",
//     parentTaskId: null,
//     subTasks: [...]
//   }
// ]
```

**Use Cases:**
- Task lists with expandable parent tasks
- Tree views
- Kanban boards grouped by parent task
- Any UI that needs hierarchical data

**Access Control:**
- **ADMINs/LEADs**: See all parent tasks with all subtasks
- **MEMBERs**: Only see parent tasks with at least one assigned subtask, and only see their assigned subtasks

---

### 2. `getAllTasksFlat()` - Flat List

Returns all tasks and subtasks as a flat array.

```typescript
import { getAllTasksFlat } from "@/data/task";

const { tasks } = await getAllTasksFlat(projectId, workspaceId);

// Structure:
// tasks = [
//   { id: "parent-1", name: "Parent Task 1", parentTaskId: null },
//   { id: "sub-1", name: "Subtask 1", parentTaskId: "parent-1" },
//   { id: "sub-2", name: "Subtask 2", parentTaskId: "parent-1" },
//   { id: "parent-2", name: "Parent Task 2", parentTaskId: null },
//   { id: "sub-3", name: "Subtask 3", parentTaskId: "parent-2" }
// ]

// Filter to get only parent tasks:
const parentTasks = tasks.filter(task => task.parentTaskId === null);

// Filter to get only subtasks:
const subtasks = tasks.filter(task => task.parentTaskId !== null);
```

**Use Cases:**
- Gantt charts (need all items in a flat list)
- Tables displaying all tasks and subtasks together
- Search/filter across all tasks
- Dependency graphs

**Access Control:**
- Same as `getTasks()`

---

### 3. `getTaskById()` - Single Task with Details

Get a specific task (parent or subtask) with full details.

```typescript
import { getTaskById } from "@/data/task";

const task = await getTaskById(taskId, workspaceId, projectId);

// For parent tasks:
// task.subTasks contains array of subtasks (filtered by access)

// For subtasks:
// task.parentTask contains parent task info
```

**Use Cases:**
- Task detail pages
- Edit task forms
- Task modals

**Access Control:**
- **ADMINs/LEADs**: Can access any task
- **MEMBERs**: 
  - Can access subtasks assigned to them
  - Can access parent tasks if they have at least one assigned subtask

---

### 4. `getSubTasks()` - Paginated Subtasks

Get subtasks for a specific parent task with pagination.

```typescript
import { getSubTasks } from "@/data/task";

const { 
  subTasks, 
  totalCount, 
  totalPages, 
  currentPage, 
  hasMore 
} = await getSubTasks(parentTaskId, workspaceId, projectId, page, pageSize);
```

**Use Cases:**
- Paginated subtask lists
- Infinite scroll implementations
- Large parent tasks with many subtasks

**Access Control:**
- **ADMINs/LEADs**: See all subtasks
- **MEMBERs**: Only see assigned subtasks

---

## Migration Guide

### Before (Old Flat Structure)

```typescript
// Old: Mixed parent tasks and subtasks in one array
const { tasks } = await getTasks(projectId, workspaceId);

// Had to manually group by parentTaskId
const parentTasks = tasks.filter(t => !t.parentTaskId);
const subtasks = tasks.filter(t => t.parentTaskId);
```

### After (New Hierarchical Structure)

```typescript
// New: Clean hierarchical structure
const { tasks } = await getTasks(projectId, workspaceId);

// Parent tasks are at top level
tasks.forEach(parentTask => {
  console.log(parentTask.name);
  
  // Subtasks are nested
  parentTask.subTasks.forEach(subtask => {
    console.log(`  - ${subtask.name}`);
  });
});

// OR use flat structure if needed
const { tasks: flatTasks } = await getAllTasksFlat(projectId, workspaceId);
```

---

## When to Use Which Function?

| Function | Use When |
|----------|----------|
| `getTasks()` | You need hierarchical data (most common) |
| `getAllTasksFlat()` | You need all items in a flat list (Gantt, tables) |
| `getTaskById()` | You need a single task with full details |
| `getSubTasks()` | You need paginated subtasks for a parent task |

---

## Performance Considerations

1. **`getTasks()`** - Single query with nested select (most efficient for hierarchical views)
2. **`getAllTasksFlat()`** - Single query, flat result (efficient for flat views)
3. **`getSubTasks()`** - Paginated, use for large subtask lists
4. **`getTaskById()`** - Single task query, includes nested data

All functions use:
- ✅ Next.js `unstable_cache` for server-side caching
- ✅ React `cache` for request deduplication
- ✅ Proper cache tags for revalidation
- ✅ Role-based access control

---

## Type Safety

```typescript
import type { 
  TaskType,           // From getTasks() - has subTasks array
  FlatTaskType,       // From getAllTasksFlat() - no subTasks
  TaskByIdType,       // From getTaskById() - full details
  SubTaskType         // From getSubTasks() - subtask only
} from "@/data/task";
```

---

## Cache Tags

All functions use consistent cache tags for revalidation:

- `task-${taskId}` - Specific task
- `project-tasks-${projectId}` - All tasks in project
- `task-subtasks-${parentTaskId}` - Subtasks of a parent
- `task-details` - Task detail pages
- `project-tasks-all` - All task lists
- `project-tasks-flat` - Flat task lists

Revalidate with:
```typescript
revalidateTag(`project-tasks-${projectId}`);
```
