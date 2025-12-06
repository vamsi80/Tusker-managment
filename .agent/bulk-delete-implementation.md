# Bulk Delete Implementation for Tasks and Subtasks

## Overview
This document describes the implementation of bulk delete functionality with selectors for both tasks and subtasks in the task table.

## Features Implemented

### 1. **Selection Checkboxes**
- ✅ Checkbox in table header to select/deselect all tasks
- ✅ Individual checkboxes for each task row
- ✅ Individual checkboxes for each subtask row
- ✅ Visual feedback for selected items

### 2. **Bulk Delete Toolbar**
A toolbar appears when items are selected, showing:
- Total number of selected items
- Breakdown of selected tasks and subtasks
- "Clear Selection" button to deselect all
- "Delete Selected" button with confirmation dialog

### 3. **State Management**
- `selectedTasks`: Set<string> - Tracks selected task IDs
- `selectedSubTasks`: Set<string> - Tracks selected subtask IDs
- `isDeletingBulk`: boolean - Loading state during bulk deletion

### 4. **Selection Handlers**
- `handleSelectAllTasks()` - Select/deselect all visible tasks
- `handleSelectTask()` - Toggle individual task selection
- `handleSelectSubTask()` - Toggle individual subtask selection
- `handleBulkDelete()` - Execute bulk deletion with confirmation

## Component Updates

### TaskTable Component
**File**: `src/app/w/[workspaceId]/p/[slug]/task/_components/task-table.tsx`

**Changes**:
- Added bulk selection state management
- Added bulk delete toolbar UI
- Added checkbox in table header for "select all"
- Passes selection props down to TaskRow and SubTaskList components
- Implements optimistic UI updates for deletions

### TaskRow Component
**File**: `src/app/w/[workspaceId]/p/[slug]/task/_components/table/task-row.tsx`

**New Props**:
- `isSelected?: boolean` - Whether the task is selected
- `onSelectChange?: (checked: boolean) => void` - Callback when selection changes

**Changes**:
- Added checkbox column at the start of the row
- Updated skeleton to include checkbox skeleton

### SubTaskList Component
**File**: `src/app/w/[workspaceId]/p/[slug]/task/_components/table/subtask-list.tsx`

**New Props**:
- `selectedSubTasks?: Set<string>` - Set of selected subtask IDs
- `onSelectSubTask?: (subTaskId: string, checked: boolean) => void` - Selection callback

**Changes**:
- Passes selection props to SubTaskRow components

### SubTaskRow Component
**File**: `src/app/w/[workspaceId]/p/[slug]/task/_components/table/subtask-row.tsx`

**New Props**:
- `isSelected?: boolean` - Whether the subtask is selected
- `onSelectChange?: (checked: boolean) => void` - Callback when selection changes

**Changes**:
- Added checkbox column at the start of the row
- Updated skeleton to include checkbox skeleton

### SubTaskSkeleton Component
**File**: `src/app/w/[workspaceId]/p/[slug]/task/_components/task-page-skeleton.tsx`

**Changes**:
- Added checkbox column skeleton to match the new layout

## User Experience Flow

1. **Selecting Items**:
   - Click checkbox in header to select all visible tasks
   - Click individual task/subtask checkboxes to select specific items
   - Bulk delete toolbar appears when any items are selected

2. **Bulk Delete**:
   - Click "Delete Selected" button
   - Confirmation dialog shows number of tasks and subtasks to be deleted
   - Upon confirmation, items are removed from UI immediately (optimistic update)
   - Server actions will be called to persist deletions (TODO)

3. **Clear Selection**:
   - Click "Clear Selection" button to deselect all items
   - Toolbar disappears when no items are selected

## TODO: Server Actions

The following server actions need to be implemented:

### Bulk Delete Tasks
```typescript
// File: src/app/actions/task/bulk-delete-tasks.ts
export async function bulkDeleteTasks(taskIds: string[]) {
  // 1. Verify user permissions
  // 2. Delete tasks from database
  // 3. Invalidate caches
  // 4. Return success/error
}
```

### Bulk Delete Subtasks
```typescript
// File: src/app/actions/task/bulk-delete-subtasks.ts
export async function bulkDeleteSubtasks(subtaskIds: string[]) {
  // 1. Verify user permissions
  // 2. Delete subtasks from database
  // 3. Update parent task counts
  // 4. Invalidate caches
  // 5. Return success/error
}
```

### Integration Points
In `task-table.tsx`, replace the TODO comments:
```typescript
// Line ~318: Replace with actual server action
if (selectedTasks.size > 0) {
  await bulkDeleteTasks(Array.from(selectedTasks));
}

// Line ~330: Replace with actual server action
if (selectedSubTasks.size > 0) {
  await bulkDeleteSubtasks(Array.from(selectedSubTasks));
}
```

## Visual Design

### Bulk Delete Toolbar
- Background: `bg-muted` with border
- Padding: `p-3`
- Layout: Flexbox with space-between
- Buttons: Outline for "Clear", Destructive for "Delete"

### Checkboxes
- Positioned in first column
- Accessible with aria-labels
- Consistent with shadcn/ui design system

## Accessibility

- All checkboxes have descriptive `aria-label` attributes
- Keyboard navigation supported through standard checkbox behavior
- Visual feedback for selected state
- Confirmation dialog prevents accidental deletions

## Performance Considerations

- Uses `Set<string>` for O(1) lookup performance
- Optimistic UI updates for immediate feedback
- Minimal re-renders through proper state management
- Efficient filtering using Set.has() method

## Testing Recommendations

1. **Selection Tests**:
   - Select all tasks
   - Select individual tasks
   - Select subtasks
   - Mixed selection (tasks + subtasks)

2. **Deletion Tests**:
   - Delete single task
   - Delete multiple tasks
   - Delete subtasks
   - Delete mixed items
   - Cancel deletion dialog

3. **Edge Cases**:
   - Delete all visible tasks
   - Delete while filtering is active
   - Delete while pagination is active
   - Selection persistence during refresh

## Migration Notes

This implementation maintains backward compatibility:
- Existing delete functionality (individual items) still works
- No database schema changes required
- Optional props allow gradual adoption
- Skeleton components updated to match new layout
