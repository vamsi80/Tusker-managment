# Task-Level RBAC Implementation Summary

## Overview
This document details the implementation of task-level Role-Based Access Control (RBAC) that restricts task creation, editing, and deletion based on user roles and task ownership.

---

## Permission Rules

### Task Creation
**Who can create tasks:**
- ✅ **Workspace ADMIN** - Can create tasks in any project
- ✅ **PROJECT_MANAGER** - Can create tasks in their managed projects
- ✅ **LEAD** - Can create tasks in projects where they have LEAD role
- ❌ **MEMBER** - Cannot create tasks
- ❌ **VIEWER** - Cannot create tasks

### Task Editing
**Permission Logic:**
```typescript
// Can edit ALL tasks in the project
const canEditAllTasks = permissions.isWorkspaceAdmin || permissions.isProjectManager;

// Can edit ONLY tasks they created
const canEditOwnTasks = permissions.isProjectLead && task.createdById === userId;

// Final permission
const canEdit = canEditAllTasks || canEditOwnTasks;
```

**Who can edit tasks:**
- ✅ **Workspace ADMIN** - Can edit ALL tasks
- ✅ **PROJECT_MANAGER** - Can edit ALL tasks in their project
- ✅ **LEAD** - Can edit ONLY tasks they created
- ❌ **LEAD** - Cannot edit tasks created by PROJECT_MANAGER or other LEADs
- ❌ **MEMBER** - Cannot edit tasks
- ❌ **VIEWER** - Cannot edit tasks

### Task Deletion
**Permission Logic:**
```typescript
// Can delete ALL tasks in the project
const canDeleteAllTasks = permissions.isWorkspaceAdmin || permissions.isProjectManager;

// Can delete ONLY tasks they created
const canDeleteOwnTasks = permissions.isProjectLead && task.createdById === userId;

// Final permission
const canDelete = canDeleteAllTasks || canDeleteOwnTasks;
```

**Who can delete tasks:**
- ✅ **Workspace ADMIN** - Can delete ALL tasks
- ✅ **PROJECT_MANAGER** - Can delete ALL tasks in their project
- ✅ **LEAD** - Can delete ONLY tasks they created
- ❌ **LEAD** - Cannot delete tasks created by PROJECT_MANAGER or other LEADs
- ❌ **MEMBER** - Cannot delete tasks
- ❌ **VIEWER** - Cannot delete tasks

### Subtask Permissions
**Same rules apply to subtasks:**
- Subtasks inherit the same permission logic as tasks
- `createdById` field tracks who created each subtask
- PROJECT_MANAGER can edit/delete all subtasks
- LEAD can only edit/delete subtasks they created

---

## Implementation Details

### 1. Database Schema
The Task model already includes the `createdById` field:

```prisma
model Task {
  // ...
  createdById String
  createdBy  User @relation("TaskCreator", fields: [createdById], references: [id])
  // ...
}
```

This field is automatically populated when a task is created and is used to determine ownership.

### 2. Permission Service Updates

#### `src/data/user/get-user-permissions.ts`
Added `isProjectManager` flag to the permissions object:

```typescript
const isProjectManager = projectMember?.projectRole === "PROJECT_MANAGER";
const canCreateSubTask = isWorkspaceAdmin || isProjectManager || isProjectLead;
const canPerformBulkOperations = isWorkspaceAdmin || isProjectManager || isProjectLead;

return {
    isWorkspaceAdmin,
    isProjectManager,  // NEW
    isProjectLead,
    // ...
};
```

### 3. Server Action Updates

#### `src/actions/task/delete-task.ts`
```typescript
// Permission logic
const canDeleteAllTasks = permissions.isWorkspaceAdmin || permissions.isProjectManager;
const canDeleteOwnTasks = permissions.isProjectLead && existingTask.createdById === user.id;

if (!canDeleteAllTasks && !canDeleteOwnTasks) {
    return {
        status: "error",
        message: permissions.isProjectLead
            ? "You can only delete tasks you created"
            : "You don't have permission to delete this task",
    };
}
```

#### `src/actions/task/update-task.ts`
```typescript
// Permission logic
const canEditAllTasks = permissions.isWorkspaceAdmin || permissions.isProjectManager;
const canEditOwnTasks = permissions.isProjectLead && existingTask.createdById === user.id;

if (!canEditAllTasks && !canEditOwnTasks) {
    return {
        status: "error",
        message: permissions.isProjectLead
            ? "You can only edit tasks you created"
            : "You don't have permission to edit this task",
    };
}
```

#### `src/actions/task/delete-subTask.ts`
Same permission logic as `delete-task.ts` but for subtasks.

#### `src/actions/task/update-subTask.ts`
Same permission logic as `update-task.ts` but for subtasks.

### 4. UI Component Updates

#### `src/app/w/[workspaceId]/p/[slug]/page.tsx`
Updated to fetch and pass permissions and userId:

```typescript
// Get current user
const user = await requireUser();

// Fetch permissions
const permissions = await getUserPermissions(workspaceId, project.id);

// Pass to TaskListView
<TaskListView
    workspaceId={workspaceId}
    projectId={project.id}
    projectMembers={projectMembers}
    permissions={permissions}
    userId={user.id}
/>
```

#### `src/app/w/[workspaceId]/p/[slug]/_components/list/project-task-list-view.tsx`
Updated to accept and pass permissions:

```typescript
interface ProjectTaskListViewProps {
    // ...
    permissions: UserPermissionsType;
    userId: string;
}

// Pass to TaskTable
<TaskTable
    // ...
    permissions={permissions}
    userId={userId}
/>
```

#### `src/components/task/list/task-table.tsx`
Updated to accept permissions and hide "Add Task" button:

```typescript
interface TaskTableProps {
    // ...
    permissions?: UserPermissionsType;
    userId?: string;
}

// Hide "Add Task" for users without permission
{canCreateSubTask && !hasActiveFilters(filters) && !searchQuery && (
    // Add Task button or form
)}
```

---

## UI Behavior

### "Add Task" Button Visibility
- **Visible for**: ADMIN, PROJECT_MANAGER, LEAD
- **Hidden for**: MEMBER, VIEWER
- **Condition**: `canCreateSubTask && !hasActiveFilters && !searchQuery`

### Edit/Delete Task Buttons
Currently, edit and delete buttons are shown in the task row dropdown menu. To fully implement permission-based visibility, you would need to:

1. Pass `permissions` and `userId` to `TaskRow` component
2. Check if user can edit/delete the specific task
3. Conditionally render edit/delete menu items

**Example implementation needed:**
```typescript
// In TaskRow component
const canEditTask = 
    permissions?.isWorkspaceAdmin || 
    permissions?.isProjectManager || 
    (permissions?.isProjectLead && task.createdById === userId);

const canDeleteTask = canEditTask; // Same logic

// Conditionally render
{canEditTask && (
    <DropdownMenuItem asChild>
        <EditTaskDialog ... />
    </DropdownMenuItem>
)}

{canDeleteTask && (
    <DropdownMenuItem asChild>
        <DeleteTaskDialog ... />
    </DropdownMenuItem>
)}
```

---

## Error Messages

### For LEAD trying to edit/delete others' tasks:
- **Edit**: "You can only edit tasks you created"
- **Delete**: "You can only delete tasks you created"

### For users without any permission:
- **Edit**: "You don't have permission to edit this task"
- **Delete**: "You don't have permission to delete this task"

---

## Testing Checklist

### Task Creation
- [ ] ADMIN can create tasks
- [ ] PROJECT_MANAGER can create tasks in their project
- [ ] LEAD can create tasks in their project
- [ ] MEMBER cannot see "Add Task" button
- [ ] VIEWER cannot see "Add Task" button

### Task Editing
- [ ] ADMIN can edit all tasks
- [ ] PROJECT_MANAGER can edit all tasks in their project
- [ ] LEAD can edit tasks they created
- [ ] LEAD cannot edit tasks created by PROJECT_MANAGER
- [ ] LEAD cannot edit tasks created by other LEADs
- [ ] LEAD gets appropriate error message when trying to edit others' tasks

### Task Deletion
- [ ] ADMIN can delete all tasks
- [ ] PROJECT_MANAGER can delete all tasks in their project
- [ ] LEAD can delete tasks they created
- [ ] LEAD cannot delete tasks created by PROJECT_MANAGER
- [ ] LEAD cannot delete tasks created by other LEADs
- [ ] LEAD gets appropriate error message when trying to delete others' tasks

### Subtask Permissions
- [ ] Same rules apply for subtasks as tasks
- [ ] PROJECT_MANAGER can edit/delete all subtasks
- [ ] LEAD can only edit/delete subtasks they created

---

## Security Considerations

1. **Server-side enforcement**: All permissions are validated in server actions
2. **UI-level hiding**: Buttons are hidden based on permissions for better UX
3. **Creator tracking**: `createdById` field ensures accurate ownership tracking
4. **Consistent error messages**: Clear feedback for permission denials
5. **No client-side bypass**: Even if UI is manipulated, server actions will reject unauthorized requests

---

## Future Enhancements

1. **Task Row Button Visibility**: Update `TaskRow` component to conditionally show edit/delete buttons based on permissions
2. **Subtask Row Button Visibility**: Same for subtask rows
3. **Bulk Operations**: Ensure bulk edit/delete operations respect per-task permissions
4. **Audit Logging**: Track who edits/deletes tasks for accountability
5. **Permission Tooltips**: Show tooltips explaining why buttons are disabled

---

## Summary

The task-level RBAC implementation provides:
- ✅ **Granular control** over task creation, editing, and deletion
- ✅ **Role-based permissions** aligned with project roles
- ✅ **Ownership-based restrictions** for LEAD role
- ✅ **Server-side validation** for security
- ✅ **UI-level hiding** for better user experience
- ✅ **Clear error messages** for permission denials

This ensures that:
- PROJECT_MANAGERs have full control over all tasks in their projects
- LEADs can manage their own tasks but not interfere with others' work
- MEMBERs and VIEWERs have appropriate read-only or limited access
- Workspace ADMINs retain full control across all projects
