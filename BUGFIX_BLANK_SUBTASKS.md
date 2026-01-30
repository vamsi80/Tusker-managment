# Bug Fix: Blank Subtask Display

## Issue
After expanding a parent task, users were seeing blank space where subtasks should be displayed.

## Root Cause
When using cached subtasks, the component was rendering with:
- `isLoading = false` (no loading state set for cache hits)
- `task.subTasks = undefined` (before state update completed)

This caused the `SubTaskList` component to show the "Add SubTask" button instead of subtasks during the brief moment between expansion and state update.

## Solution
Modified `toggleExpand` function to set loading state even for cache hits:

```typescript
if (cached) {
    // Set loading briefly to prevent blank display
    setLoadingSubTasks((prev) => ({ ...prev, [taskId]: true }));
    
    // Update task with cached subtasks
    setTasks((prevTasks) => ...);
    
    // Clear loading immediately
    setLoadingSubTasks((prev) => ({ ...prev, [taskId]: false }));
    return;
}
```

## Result
- Loading skeleton shows briefly (prevents blank state)
- Cached subtasks appear immediately after
- No more blank display
- Performance still optimal (no server call)

## File Modified
- `src/components/task/list/task-table.tsx` (toggleExpand function)
