# Delete Task Function - Implementation ✅

## 🎯 Function: `deleteTask`

A server action to delete a task with proper permission checks and cascade deletion of subtasks.

---

## 📝 **Function Signature:**

```typescript
export async function deleteTask(
    taskId: string
): Promise<ApiResponse>
```

**Parameters:**
- `taskId` - The ID of the task to delete

**Returns:**
- `ApiResponse` - Success or error response

---

## 🔒 **Permission Requirements:**

Only the following users can delete tasks:
- ✅ **Workspace Admins** - Can delete any task in the workspace
- ✅ **Project Leads** - Can delete tasks in their projects
- ❌ **Regular Members** - Cannot delete tasks

---

## 🔄 **How It Works:**

### **Step-by-Step Flow:**

```
1. Authenticate user
         ↓
2. Fetch task with project/workspace info
         ↓
3. Verify task exists
         ↓
4. Check user permissions
         ↓
5. Delete task from database
         ↓
6. Cascade delete all subtasks (automatic)
         ↓
7. Revalidate cache
         ↓
8. Return success response
```

---

## 💻 **Implementation Details:**

### **1. Fetch Task with Relations**
```typescript
const existingTask = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
        project: {
            select: {
                id: true,
                workspaceId: true,
                slug: true,
            }
        }
    }
});
```

### **2. Validate Task Exists**
```typescript
if (!existingTask) {
    return {
        status: "error",
        message: "Task not found",
    };
}
```

### **3. Check Permissions**
```typescript
const permissions = await getUserPermissions(
    existingTask.project.workspaceId,
    existingTask.project.id
);

if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
    return {
        status: "error",
        message: "You don't have permission to delete this task",
    };
}
```

### **4. Delete Task (Cascade)**
```typescript
await prisma.task.delete({
    where: { id: taskId },
});
// Note: All subtasks are automatically deleted due to onDelete: Cascade
```

### **5. Revalidate Cache**
```typescript
revalidatePath(`/w/${existingTask.project.workspaceId}/p/${existingTask.project.slug}/task`);
```

---

## ✨ **Key Features:**

### **1. Permission-Based Access**
- Checks if user is workspace admin or project lead
- Returns error if user lacks permissions
- Secure deletion

### **2. Cascade Deletion**
- Automatically deletes all subtasks
- No orphaned subtasks left behind
- Clean database state

### **3. Cache Revalidation**
- Invalidates task list cache
- Ensures UI updates after deletion
- Fresh data on next load

### **4. Error Handling**
- Validates task exists
- Catches database errors
- Returns user-friendly messages

---

## 📊 **Response Types:**

### **Success Response:**
```typescript
{
    status: "success",
    message: "Task deleted successfully"
}
```

### **Error Responses:**

**Task Not Found:**
```typescript
{
    status: "error",
    message: "Task not found"
}
```

**Permission Denied:**
```typescript
{
    status: "error",
    message: "You don't have permission to delete this task"
}
```

**Database Error:**
```typescript
{
    status: "error",
    message: "We couldn't delete the task. Please try again."
}
```

---

## 🔍 **Security Features:**

### **1. Authentication**
- Requires authenticated user
- Uses `requireUser()` helper

### **2. Authorization**
- Checks workspace membership
- Verifies admin or lead role
- Prevents unauthorized deletion

### **3. Validation**
- Validates task exists
- Checks task belongs to project
- Ensures data integrity

---

## 🎯 **Usage Example:**

```typescript
// In a client component or dialog
const handleDelete = async () => {
    const result = await deleteTask(taskId);
    
    if (result.status === "success") {
        toast.success(result.message);
        // Update UI - remove task from list
    } else {
        toast.error(result.message);
    }
};
```

---

## 📋 **Database Impact:**

### **What Gets Deleted:**

1. **Main Task** - The task record itself
2. **All Subtasks** - Cascade deleted automatically
3. **Related Data** - Any data with `onDelete: Cascade`

### **What Remains:**

- **Project** - Not affected
- **Workspace** - Not affected
- **Users** - Not affected
- **Other Tasks** - Not affected

---

## ⚠️ **Important Notes:**

### **1. Cascade Deletion**
- All subtasks are automatically deleted
- This is irreversible
- Make sure to confirm with user before calling

### **2. Cache Revalidation**
- `revalidatePath` invalidates the cache
- UI will show updated list on next load
- Use optimistic updates for instant UI feedback

### **3. Permissions**
- Only admins and project leads can delete
- Regular members will get permission error
- Check permissions in UI before showing delete option

---

## 🚀 **Next Steps:**

To integrate this function:

1. **Create Delete Dialog** - Confirmation dialog
2. **Add Delete Button** - In task row dropdown
3. **Handle Response** - Show success/error messages
4. **Update UI** - Remove task from list optimistically
5. **Add Confirmation** - "Are you sure?" dialog

---

## 📝 **Example Integration:**

```typescript
// In task-row.tsx
const handleDelete = async () => {
    // Show confirmation dialog
    const confirmed = await confirmDialog({
        title: "Delete Task",
        message: "Are you sure? This will delete all subtasks too.",
    });
    
    if (!confirmed) return;
    
    // Show loading state
    setDeleting(true);
    
    // Call server action
    const result = await deleteTask(task.id);
    
    if (result.status === "success") {
        toast.success(result.message);
        // Remove from UI optimistically
        onTaskDeleted(task.id);
    } else {
        toast.error(result.message);
    }
    
    setDeleting(false);
};
```

---

**Status:** ✅ Implemented  
**Permissions:** ✅ Admin & Lead only  
**Cascade:** ✅ Deletes subtasks  
**Cache:** ✅ Revalidates  
**Security:** ✅ Secure

The delete task function is ready to use! 🎉
