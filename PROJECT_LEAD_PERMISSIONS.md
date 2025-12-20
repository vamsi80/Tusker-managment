# Project LEAD Permissions Added! ✅

## 🎯 What Was Implemented

Added **project-level LEAD permissions** to allow project LEADs to see all tasks/subtasks in their specific project, not just assigned ones.

---

## 📝 Permission Hierarchy

### **Before** ❌
- **ADMIN/OWNER**: See all tasks in all projects
- **MEMBER**: See only assigned tasks

### **After** ✅
- **ADMIN/OWNER**: See all tasks in all projects
- **Project LEAD**: See all tasks in **their specific project** (when filtering by that project)
- **MEMBER**: See only assigned tasks

---

## 🔧 Changes Made

### **1. New Permission Function** ✅

**File**: `src/data/user/get-user-permissions.ts`

```typescript
/**
 * Get project-level permissions (for when filtering by specific project)
 * Checks if user is a LEAD of the specified project
 */
export const getProjectLevelPermissions = cache(async (workspaceId: string, projectId: string) => {
    const user = await requireUser();
    
    const workspaceMember = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: user.id },
    });
    
    const projectMember = await prisma.projectMember.findFirst({
        where: {
            projectId: projectId,
            workspaceMemberId: workspaceMember.id,
        },
    });
    
    const isProjectLead = projectMember?.projectRole === "LEAD";
    
    return {
        isProjectLead,
        projectMemberId: projectMember?.id || null,
    };
});
```

---

### **2. Updated Kanban Query** ✅

**File**: `src/data/task/kanban/get-subtasks-by-status.ts`

**Internal Function**:
```typescript
async function _getSubTasksByStatusInternal(
    workspaceId: string,
    workspaceMemberId: string,
    isAdmin: boolean,
    isProjectLead: boolean,  // ← NEW!
    status: TaskStatus,
    projectId: string | undefined,
    page: number,
    pageSize: number
) {
    // ...
    
    // Permission logic:
    // - ADMIN/OWNER: See all subtasks
    // - Project LEAD (when filtering by that project): See all subtasks in that project
    // - MEMBER: See only assigned subtasks
    if (!isAdmin && !isProjectLead) {
        whereClause.assignee = { workspaceMemberId: workspaceMemberId };
    }
}
```

**Public Function**:
```typescript
export const getSubTasksByStatus = cache(async (...) => {
    // Get workspace permissions
    const permissions = await getWorkspacePermissions(workspaceId);
    
    // ✅ Check if user is LEAD of the specific project
    let isProjectLead = false;
    if (projectId && !permissions.isWorkspaceAdmin) {
        const projectPermissions = await getProjectLevelPermissions(workspaceId, projectId);
        isProjectLead = projectPermissions.isProjectLead;
    }
    
    return await getCachedSubTasksByStatus(
        workspaceId,
        permissions.workspaceMemberId,
        permissions.workspaceMemberId,
        permissions.isWorkspaceAdmin,
        isProjectLead,  // ← Pass to internal function
        status,
        projectId,
        page,
        pageSize
    );
});
```

---

## 🎯 How It Works

### **Scenario 1: Workspace Admin**
```typescript
// User: Workspace ADMIN
// Result: See ALL subtasks in ALL projects
isAdmin = true
isProjectLead = false (not checked)
// → No assignee filter applied
```

### **Scenario 2: Project LEAD (filtering by their project)**
```typescript
// User: Project LEAD of Project A
// Filtering by: Project A
isAdmin = false
isProjectLead = true  // ← Checked!
// → No assignee filter applied for Project A
// → Can see ALL subtasks in Project A
```

### **Scenario 3: Project LEAD (filtering by different project)**
```typescript
// User: Project LEAD of Project A
// Filtering by: Project B
isAdmin = false
isProjectLead = false  // ← Not LEAD of Project B
// → Assignee filter applied
// → Can only see assigned subtasks in Project B
```

### **Scenario 4: Regular Member**
```typescript
// User: MEMBER
// Filtering by: Any project
isAdmin = false
isProjectLead = false
// → Assignee filter applied
// → Can only see assigned subtasks
```

---

## 📊 Permission Matrix

| User Role | Workspace View | Project View (Own Project) | Project View (Other Project) |
|-----------|----------------|----------------------------|------------------------------|
| **ADMIN/OWNER** | ✅ All tasks | ✅ All tasks | ✅ All tasks |
| **Project LEAD** | ✅ Assigned only | ✅ **All tasks** | ✅ Assigned only |
| **MEMBER** | ✅ Assigned only | ✅ Assigned only | ✅ Assigned only |

---

## ⚡ Performance Considerations

### **Caching**
```typescript
// Cache key includes isProjectLead status
[`kanban-ws-${workspaceId}-${projectId || 'all'}-${status}-${userId}-lead${isProjectLead}-p${page}-s${pageSize}`]
```

**Benefits**:
- ✅ Separate cache for LEADs vs MEMBERs
- ✅ Correct data always served
- ✅ No cache pollution

### **Conditional Check**
```typescript
// Only check project LEAD if:
// 1. Filtering by specific project
// 2. User is not already workspace admin
if (projectId && !permissions.isWorkspaceAdmin) {
    const projectPermissions = await getProjectLevelPermissions(workspaceId, projectId);
    isProjectLead = projectPermissions.isProjectLead;
}
```

**Benefits**:
- ✅ Avoids unnecessary database query for admins
- ✅ Only checks when filtering by project
- ✅ Cached result (React cache)

---

## 🚀 Next Steps

### **Apply Same Logic to Workspace Tasks**

Update `src/data/task/get-workspace-tasks.ts` with the same project LEAD logic:

```typescript
// TODO: Add isProjectLead parameter
// TODO: Check getProjectLevelPermissions when projectId filter is used
// TODO: Update permission logic in internal function
```

---

## ✨ Benefits

| Before | After |
|--------|-------|
| Project LEADs see only assigned tasks | ✅ Project LEADs see **all tasks in their project** |
| Had to be workspace ADMIN to see all | ✅ Project-level authority recognized |
| Inconsistent with project hierarchy | ✅ Matches organizational structure |

---

**Project LEAD permissions are now properly implemented!** 🎉

**Project LEADs can now manage their entire project effectively!** ✅
