# Reloadable View - Usage Guide

## Overview

The `ReloadableView` component provides a unified way to reload data across all project views (Dashboard, List, Kanban, and Gantt). It listens for a custom browser event and triggers a server-side data refresh.

## Architecture

### Component Location
- **Path**: `src/app/w/[workspaceId]/p/[slug]/_components/shared/reloadable-view.tsx`
- **Type**: Client Component
- **Purpose**: Wraps view components and handles reload events

### How It Works

1. **Event Listener**: Listens for `taskTableReload` custom events on the window object
2. **Router Refresh**: Uses Next.js `router.refresh()` to trigger server-side data refetch
3. **Loading State**: Shows appropriate skeleton while reloading
4. **Transition**: Uses React's `useTransition` for smooth UI updates

## Usage

### Custom Hook (Recommended)

The easiest way to trigger a reload is using the `useReloadView` hook:

```tsx
"use client";

import { useReloadView } from "@/hooks/use-reload-view";

export function MyComponent() {
  const reloadView = useReloadView();

  const handleAction = async () => {
    await someAction();
    reloadView(); // ✅ Simple and clean
  };

  return <button onClick={handleAction}>Do Something</button>;
}
```

### In Page Components

All views are now wrapped with `ReloadableView`:

```tsx
import { ReloadableView } from "./_components/shared/reloadable-view";
import { TaskTableSkeleton } from "@/components/task/list/list-skeleton";

// Dashboard View
<ReloadableView skeleton={<TaskTableSkeleton />}>
  <Suspense fallback={<TaskTableSkeleton />}>
    <ProjectDashboardPage />
  </Suspense>
</ReloadableView>

// List View
<ReloadableView skeleton={<TaskTableSkeleton />}>
  <Suspense fallback={<TaskTableSkeleton />}>
    <TaskListView {...props} />
  </Suspense>
</ReloadableView>

// Kanban View
<ReloadableView skeleton={<KanbanBoardSkeleton />}>
  <Suspense fallback={<KanbanBoardSkeleton />}>
    <TaskKanbanView {...props} />
  </Suspense>
</ReloadableView>

// Gantt View
<ReloadableView skeleton={<GanttChartSkeleton />}>
  <Suspense fallback={<GanttChartSkeleton />}>
    <TaskGanttView {...props} />
  </Suspense>
</ReloadableView>
```

### Triggering a Reload

From any client component (forms, dialogs, buttons, etc.), dispatch the reload event:

```tsx
// After creating/updating/deleting a task
window.dispatchEvent(new Event('taskTableReload'));
```

### Example: In a Form Submit Handler

```tsx
"use client";

import { createTaskAction } from "@/actions/task/create-task";

export function CreateTaskForm() {
  const handleSubmit = async (data: FormData) => {
    const result = await createTaskAction(data);
    
    if (result.success) {
      // Trigger reload across all views
      window.dispatchEvent(new Event('taskTableReload'));
      
      // Close dialog, show toast, etc.
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Example: In a Server Action Callback

```tsx
"use client";

import { deleteTaskAction } from "@/actions/task/delete-task";
import { useTransition } from "react";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      await deleteTaskAction(taskId);
      
      // Trigger reload
      window.dispatchEvent(new Event('taskTableReload'));
    });
  };

  return (
    <button onClick={handleDelete} disabled={isPending}>
      Delete Task
    </button>
  );
}
```

## Benefits

### 1. **Consistency**
- All views reload in the same way
- Predictable behavior across the application

### 2. **Simplicity**
- Single event to trigger reload from anywhere
- No need to pass callbacks through multiple component layers

### 3. **Server-Side Data Fetching**
- Uses Next.js `router.refresh()` to refetch server components
- Ensures data is always fresh from the database
- Maintains GET request pattern for data fetching

### 4. **Smooth UX**
- Shows appropriate loading skeleton during reload
- Uses React transitions for smooth updates
- No jarring page refreshes

### 5. **View-Specific Skeletons**
- Each view can have its own skeleton component
- Better visual feedback for users

## Migration Notes

### Old Pattern (Deprecated)
```tsx
// ❌ Old: ReloadableTaskTable (only for list view)
import { ReloadableTaskTable } from "./_components/list/reloadable-task-table";

<ReloadableTaskTable>
  <TaskListView />
</ReloadableTaskTable>
```

### New Pattern (Current)
```tsx
// ✅ New: ReloadableView (works for all views)
import { ReloadableView } from "./_components/shared/reloadable-view";

<ReloadableView skeleton={<YourSkeleton />}>
  <YourView />
</ReloadableView>
```

## Common Use Cases

### 1. Task Creation (Using Hook)
```tsx
import { useReloadView } from "@/hooks/use-reload-view";

export function CreateTaskButton() {
  const reloadView = useReloadView();

  const handleCreate = async () => {
    await createTaskAction(formData);
    reloadView(); // ✅ Reload all views
  };

  return <button onClick={handleCreate}>Create Task</button>;
}
```

### 2. Task Update (Using Hook)
```tsx
import { useReloadView } from "@/hooks/use-reload-view";

export function EditTaskForm({ taskId }: { taskId: string }) {
  const reloadView = useReloadView();

  const handleUpdate = async (updates: any) => {
    await updateTaskAction(taskId, updates);
    reloadView(); // ✅ Reload all views
  };

  return <form onSubmit={handleUpdate}>...</form>;
}
```

### 3. Task Deletion (Using Hook)
```tsx
import { useReloadView } from "@/hooks/use-reload-view";

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const reloadView = useReloadView();

  const handleDelete = async () => {
    await deleteTaskAction(taskId);
    reloadView(); // ✅ Reload all views
  };

  return <button onClick={handleDelete}>Delete</button>;
}
```

### 4. Bulk Operations (Using Hook)
```tsx
import { useReloadView } from "@/hooks/use-reload-view";

export function BulkActionsToolbar({ selectedIds }: { selectedIds: string[] }) {
  const reloadView = useReloadView();

  const handleBulkUpdate = async () => {
    await bulkUpdateTasksAction(selectedIds, updates);
    reloadView(); // ✅ Reload all views
  };

  return <button onClick={handleBulkUpdate}>Update Selected</button>;
}
```

### 5. Status Changes - Kanban (Using Hook)
```tsx
import { useReloadView } from "@/hooks/use-reload-view";

export function KanbanCard({ task }: { task: Task }) {
  const reloadView = useReloadView();

  const handleDragEnd = async (newStatus: string) => {
    await updateTaskStatusAction(task.id, newStatus);
    reloadView(); // ✅ Reload all views
  };

  return <div onDragEnd={handleDragEnd}>...</div>;
}
```

### 6. Date Changes - Gantt (Using Hook)
```tsx
import { useReloadView } from "@/hooks/use-reload-view";

export function GanttBar({ task }: { task: Task }) {
  const reloadView = useReloadView();

  const handleDateChange = async (newDates: { start: Date; end: Date }) => {
    await updateTaskDatesAction(task.id, newDates);
    reloadView(); // ✅ Reload all views
  };

  return <div onDragEnd={handleDateChange}>...</div>;
}
```

### Alternative: Direct Event Dispatch (Without Hook)

If you can't use hooks (e.g., in a non-component context), you can still dispatch the event directly:

```tsx
// After any task operation
window.dispatchEvent(new Event('taskTableReload'));
```


## Technical Details

### Event Name
- **Event**: `taskTableReload`
- **Type**: Custom browser event
- **Scope**: Window-level (global)

### Performance Considerations
- Uses React's `useTransition` for non-blocking updates
- Shows skeleton immediately for better perceived performance
- Server components are refetched efficiently by Next.js

### Browser Compatibility
- Works in all modern browsers
- Uses standard `window.dispatchEvent` API
- No polyfills required

## Future Enhancements

Potential improvements:
1. Add event payload for selective reloading (e.g., only reload specific views)
2. Implement debouncing for rapid successive updates
3. Add optimistic UI updates before server refetch
4. Add analytics/telemetry for reload events

## Related Files

- **Component**: `src/app/w/[workspaceId]/p/[slug]/_components/shared/reloadable-view.tsx`
- **Hook**: `src/hooks/use-reload-view.ts`
- **Page**: `src/app/w/[workspaceId]/p/[slug]/page.tsx`
- **Skeletons**:
  - `src/components/task/list/list-skeleton.tsx`
  - `src/components/task/kanban/kanban-skeleton.tsx`
  - `src/components/task/gantt/gantt-skeleton.tsx`
