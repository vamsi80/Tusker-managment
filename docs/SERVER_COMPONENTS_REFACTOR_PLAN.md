# Server Components Refactoring Plan

## Current Issue
- TaskTable is a client component that calls server functions
- This causes POST requests for subtask loading
- User wants to eliminate POST requests by using server components

## Solution: Server Components with Suspense

### Architecture Changes

1. **Keep Parent Tasks Server-Side** ✅ (Already done)
   - `WorkspaceListView` is a server component
   - Fetches initial tasks on server

2. **Create Server Component for Subtasks** 🔄 (To implement)
   - New component: `SubTasksServerList`
   - Fetches subtasks on server when expanded
   - Uses Suspense for loading states

3. **Use URL State for Expansion** 🔄 (To implement)
   - Store expanded task IDs in URL search params
   - Server can read URL and fetch appropriate subtasks
   - No client-side data fetching needed

### Implementation Steps

#### Step 1: Create Server Component for Subtasks
**File**: `src/app/w/[workspaceId]/tasks/_components/subtasks-server-list.tsx`

```tsx
import { getSubTasks } from "@/data/task/get-subtasks";
import { SubTaskRow } from "./subtask-row";

interface SubTasksServerListProps {
    taskId: string;
    workspaceId: string;
    projectId: string;
}

export async function SubTasksServerList({
    taskId,
    workspaceId,
    projectId,
}: SubTasksServerListProps) {
    const { subTasks } = await getSubTasks(taskId, workspaceId, projectId, 1, 10);
    
    return (
        <>
            {subTasks.map(subtask => (
                <SubTaskRow key={subtask.id} subtask={subtask} />
            ))}
        </>
    );
}
```

#### Step 2: Update Task Row to Use URL State
**File**: `src/app/w/[workspaceId]/tasks/_components/task-row-server.tsx`

```tsx
import Link from "next/link";
import { Suspense } from "react";
import { SubTasksServerList } from "./subtasks-server-list";
import { SubTaskSkeleton } from "./subtask-skeleton";

interface TaskRowServerProps {
    task: Task;
    isExpanded: boolean;
    workspaceId: string;
}

export function TaskRowServer({ task, isExpanded, workspaceId }: TaskRowServerProps) {
    const expandUrl = isExpanded 
        ? `?` // Remove from URL
        : `?expanded=${task.id}`; // Add to URL
    
    return (
        <>
            <tr>
                <td>
                    <Link href={expandUrl}>
                        {isExpanded ? "▼" : "▶"}
                    </Link>
                </td>
                <td>{task.name}</td>
                {/* ... other columns */}
            </tr>
            
            {isExpanded && (
                <Suspense fallback={<SubTaskSkeleton count={2} />}>
                    <SubTasksServerList 
                        taskId={task.id}
                        workspaceId={workspaceId}
                        projectId={task.projectId}
                    />
                </Suspense>
            )}
        </>
    );
}
```

#### Step 3: Update Main Table Component
**File**: `src/app/w/[workspaceId]/tasks/_components/workspace-task-table-server.tsx`

```tsx
import { TaskRowServer } from "./task-row-server";

interface WorkspaceTaskTableServerProps {
    tasks: Task[];
    workspaceId: string;
    expandedTaskId?: string;
}

export function WorkspaceTaskTableServer({
    tasks,
    workspaceId,
    expandedTaskId,
}: WorkspaceTaskTableServerProps) {
    return (
        <table>
            <thead>{/* ... */}</thead>
            <tbody>
                {tasks.map(task => (
                    <TaskRowServer
                        key={task.id}
                        task={task}
                        isExpanded={task.id === expandedTaskId}
                        workspaceId={workspaceId}
                    />
                ))}
            </tbody>
        </table>
    );
}
```

#### Step 4: Update Page to Read URL Params
**File**: `src/app/w/[workspaceId]/tasks/_components/views/workspace-list-view.tsx`

```tsx
export async function WorkspaceListView({ 
    workspaceId,
    searchParams 
}: WorkspaceListViewProps) {
    const { tasks, hasMore, totalCount } = await getWorkspaceTasks(workspaceId, {}, 1, 10);
    const expandedTaskId = searchParams?.expanded;

    return (
        <div className="flex-1 overflow-hidden">
            <WorkspaceTaskTableServer
                tasks={tasks}
                workspaceId={workspaceId}
                expandedTaskId={expandedTaskId}
            />
        </div>
    );
}
```

### Benefits

✅ **No POST Requests**: All data fetched on server
✅ **SEO Friendly**: Subtasks rendered on server
✅ **Better Performance**: Streaming with Suspense
✅ **Type Safe**: Full TypeScript support
✅ **Cacheable**: Server-side caching works perfectly
✅ **Progressive Enhancement**: Works without JavaScript

### Challenges

⚠️ **URL State**: Expansion state in URL (can be long with multiple expanded tasks)
⚠️ **Page Reload**: Expanding task causes page navigation
⚠️ **Complex Interactions**: Drag-and-drop, inline editing harder to implement

### Alternative: Hybrid Approach

Keep client components for interactions, but use server actions more efficiently:
- Use `useTransition` for optimistic updates
- Batch requests
- Better caching strategy

## Recommendation

For a task management system with lots of interactions (drag-drop, inline edit, etc.):
- **Keep current approach** (POST requests are fine)
- **Optimize with React Query** for better caching
- **Use optimistic updates** for better UX

OR

For a more read-heavy, SEO-focused approach:
- **Implement full server components** as outlined above
- Accept URL-based state management
- Trade some interactivity for performance

Which direction would you like to go?
