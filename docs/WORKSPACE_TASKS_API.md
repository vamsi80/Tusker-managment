# Workspace Tasks API Reference

## Quick Start

```typescript
import { getWorkspaceTasks } from '@/data/task/get-workspace-tasks';

// Basic usage
const { tasks, totalCount } = await getWorkspaceTasks(workspaceId);

// With filters
const { tasks } = await getWorkspaceTasks(workspaceId, {
  status: 'IN_PROGRESS',
  projectId: 'project-123',
  assigneeId: 'user-456',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  tag: 'DESIGN'
});
```

## API Reference

### `getWorkspaceTasks(workspaceId, filters?)`

Fetches all parent tasks from all accessible projects in a workspace.

**Parameters:**
- `workspaceId` (string, required): The workspace ID
- `filters` (WorkspaceTaskFilters, optional): Filtering options

**Returns:**
```typescript
{
  tasks: Array<{
    id: string;
    name: string;
    taskSlug: string;
    description: string | null;
    status: TaskStatus | null;
    position: number | null;
    startDate: Date | null;
    days: number | null;
    tag: TaskTag | null;
    projectId: string;
    isPinned: boolean;
    pinnedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    project: {
      id: string;
      name: string;
      slug: string;
      workspaceId: string;
    };
    assignee: {
      id: string;
      workspaceMember: {
        id: string;
        user: {
          id: string;
          name: string;
          surname: string | null;
          image: string | null;
        };
      };
    } | null;
    createdBy: {
      user: {
        id: string;
        name: string;
        surname: string | null;
        image: string | null;
      };
    };
    _count: {
      subTasks: number;
    };
  }>;
  totalCount: number;
}
```

## Filter Options

### `WorkspaceTaskFilters`

```typescript
interface WorkspaceTaskFilters {
  status?: TaskStatus;      // Filter by task status
  projectId?: string;       // Filter by specific project
  assigneeId?: string;      // Filter by assignee user ID
  startDate?: Date;         // Tasks starting after this date
  endDate?: Date;           // Tasks ending before this date
  tag?: TaskTag;            // Filter by task tag
}
```

### TaskStatus Enum
```typescript
enum TaskStatus {
  TO_DO = 'TO_DO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  REVIEW = 'REVIEW',
  HOLD = 'HOLD',
  COMPLETED = 'COMPLETED'
}
```

### TaskTag Enum
```typescript
enum TaskTag {
  DESIGN = 'DESIGN',
  PROCUREMENT = 'PROCUREMENT',
  CONTRACTOR = 'CONTRACTOR'
}
```

## Cache Invalidation

### Invalidate Workspace Tasks

```typescript
import { invalidateWorkspaceTasks } from '@/lib/cache/invalidation';

await invalidateWorkspaceTasks(workspaceId);
```

### Invalidate Both Project and Workspace

```typescript
import { invalidateTaskCaches } from '@/lib/cache/invalidation';

await invalidateTaskCaches(projectId, workspaceId);
```

## Usage Examples

### Example 1: Fetch All Tasks
```typescript
export async function WorkspaceTasksPage({ workspaceId }: Props) {
  const { tasks, totalCount } = await getWorkspaceTasks(workspaceId);
  
  return (
    <div>
      <h1>All Tasks ({totalCount})</h1>
      <TaskList tasks={tasks} />
    </div>
  );
}
```

### Example 2: Filter by Status
```typescript
export async function InProgressTasks({ workspaceId }: Props) {
  const { tasks } = await getWorkspaceTasks(workspaceId, {
    status: 'IN_PROGRESS'
  });
  
  return <TaskList tasks={tasks} />;
}
```

### Example 3: Filter by Project and Assignee
```typescript
export async function ProjectAssigneeTasks({ 
  workspaceId, 
  projectId, 
  userId 
}: Props) {
  const { tasks } = await getWorkspaceTasks(workspaceId, {
    projectId,
    assigneeId: userId
  });
  
  return <TaskList tasks={tasks} />;
}
```

### Example 4: Filter by Date Range
```typescript
export async function TasksThisMonth({ workspaceId }: Props) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  
  const endOfMonth = new Date();
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);
  endOfMonth.setDate(0);
  
  const { tasks } = await getWorkspaceTasks(workspaceId, {
    startDate: startOfMonth,
    endDate: endOfMonth
  });
  
  return <TaskList tasks={tasks} />;
}
```

### Example 5: Multiple Filters
```typescript
export async function DesignTasksInProgress({ 
  workspaceId, 
  projectId 
}: Props) {
  const { tasks } = await getWorkspaceTasks(workspaceId, {
    status: 'IN_PROGRESS',
    tag: 'DESIGN',
    projectId
  });
  
  return <TaskList tasks={tasks} />;
}
```

### Example 6: Lazy-Load Subtasks
```typescript
'use client';

import { useState } from 'react';
import { getTaskSubTasks } from '@/data/task/get-project-tasks';

export function TaskRow({ task, workspaceId }: Props) {
  const [subtasks, setSubtasks] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const loadSubtasks = async () => {
    if (!isExpanded && task._count.subTasks > 0) {
      const { subTasks } = await getTaskSubTasks(
        task.id,
        workspaceId,
        task.projectId,
        1,
        10
      );
      setSubtasks(subTasks);
    }
    setIsExpanded(!isExpanded);
  };
  
  return (
    <div>
      <button onClick={loadSubtasks}>
        {task.name} ({task._count.subTasks} subtasks)
      </button>
      {isExpanded && subtasks.map(subtask => (
        <div key={subtask.id}>{subtask.name}</div>
      ))}
    </div>
  );
}
```

## Permissions

### Workspace Admin/Owner
- Sees **all tasks** from **all projects** in the workspace
- No filtering based on project membership

### Workspace Member
- Sees **only tasks** from **projects they belong to**
- Automatically filtered based on `ProjectMember` relationship

### Example Permission Check
```typescript
// In getWorkspaceTasks function
const isAdmin = workspaceMember.workspaceRole === "ADMIN" || 
                workspaceMember.workspaceRole === "OWNER";

const projects = await prisma.project.findMany({
  where: {
    workspaceId,
    // If member, only show projects they belong to
    ...(isAdmin ? {} : {
      projectMembers: {
        some: {
          workspaceMemberId: workspaceMember.id,
          hasAccess: true,
        },
      },
    }),
  },
});
```

## Performance Tips

### 1. Use Server-Side Filtering
```typescript
// ✅ Good - filter on server
const { tasks } = await getWorkspaceTasks(workspaceId, {
  status: 'IN_PROGRESS'
});

// ❌ Bad - fetch all then filter on client
const { tasks } = await getWorkspaceTasks(workspaceId);
const filtered = tasks.filter(t => t.status === 'IN_PROGRESS');
```

### 2. Lazy-Load Subtasks
```typescript
// ✅ Good - subtasks loaded on demand
const { tasks } = await getWorkspaceTasks(workspaceId);
// Later: load subtasks when user expands

// ❌ Bad - fetch all subtasks upfront
const tasks = await getWorkspaceAllTasks(workspaceId); // Old function
```

### 3. Use Appropriate Filters
```typescript
// ✅ Good - narrow down results
const { tasks } = await getWorkspaceTasks(workspaceId, {
  projectId: 'specific-project',
  status: 'IN_PROGRESS'
});

// ⚠️ Acceptable but slower - fetch all tasks
const { tasks } = await getWorkspaceTasks(workspaceId);
```

## Cache Behavior

### Cache Keys
```typescript
// Format
`workspace-tasks-${workspaceId}-user-${userId}-filters-${filterHash}`

// Example
"workspace-tasks-ws123-user-u456-filters-s:IN_PROGRESS|p:proj789"
```

### Cache Tags
```typescript
[
  `workspace-tasks-${workspaceId}`,  // Workspace-specific
  `workspace-tasks-user-${userId}`,  // User-specific
  `workspace-tasks-all`              // Global
]
```

### Revalidation
- **Time-based**: 60 seconds
- **On-demand**: When tasks are created/updated/deleted

### Invalidation Triggers
```typescript
// Task mutations
createTask() → invalidateWorkspaceTasks(workspaceId)
updateTask() → invalidateWorkspaceTasks(workspaceId)
deleteTask() → invalidateWorkspaceTasks(workspaceId)

// Subtask mutations
createSubTask() → invalidateWorkspaceTasks(workspaceId)
updateSubTask() → invalidateWorkspaceTasks(workspaceId)
deleteSubTask() → invalidateWorkspaceTasks(workspaceId)
```

## Error Handling

### No Workspace Access
```typescript
const { tasks } = await getWorkspaceTasks(workspaceId);
// Returns: { tasks: [], totalCount: 0 }
```

### No Projects in Workspace
```typescript
const { tasks } = await getWorkspaceTasks(workspaceId);
// Returns: { tasks: [], totalCount: 0 }
```

### Invalid Filters
```typescript
// Filters are optional - invalid values are ignored
const { tasks } = await getWorkspaceTasks(workspaceId, {
  status: 'INVALID_STATUS' as any
});
// Returns: All tasks (filter ignored)
```

## TypeScript Types

### Import Types
```typescript
import type { 
  WorkspaceTasksResponse,
  WorkspaceTaskType,
  WorkspaceTaskFilters 
} from '@/data/task/get-workspace-tasks';
```

### Use Types
```typescript
function processTask(task: WorkspaceTaskType[number]) {
  console.log(task.name);
}

function processTasks(response: WorkspaceTasksResponse) {
  console.log(response.tasks.length);
  console.log(response.totalCount);
}
```

## Migration from Old Function

### Before (Old)
```typescript
import { getWorkspaceAllTasks } from '@/data/task/get-workspace-all-tasks';

const tasks = await getWorkspaceAllTasks(workspaceId);
// Returns tasks with ALL subtasks included
```

### After (New)
```typescript
import { getWorkspaceTasks } from '@/data/task/get-workspace-tasks';

const { tasks } = await getWorkspaceTasks(workspaceId);
// Returns parent tasks only, subtasks lazy-loaded
```

### Key Differences
| Aspect | Old | New |
|--------|-----|-----|
| Subtasks | ✅ Included | ❌ Lazy-loaded |
| Filters | ❌ None | ✅ Comprehensive |
| Performance | ❌ Slow | ✅ Fast |
| Return Type | `Task[]` | `{ tasks, totalCount }` |

## Related Functions

### Get Subtasks (Existing)
```typescript
import { getTaskSubTasks } from '@/data/task/get-project-tasks';

const { subTasks, totalCount, hasMore } = await getTaskSubTasks(
  parentTaskId,
  workspaceId,
  projectId,
  page,
  pageSize
);
```

### Get Project Tasks (Existing)
```typescript
import { getProjectTasks } from '@/data/task/get-project-tasks';

const { tasks, totalCount, hasMore } = await getProjectTasks(
  projectId,
  workspaceId,
  page,
  pageSize
);
```

## Support

For issues or questions:
1. Check `docs/WORKSPACE_TASKS_ARCHITECTURE.md` for architecture details
2. Check `docs/WORKSPACE_TASKS_IMPLEMENTATION.md` for implementation details
3. Review the source code in `src/data/task/get-workspace-tasks.ts`
