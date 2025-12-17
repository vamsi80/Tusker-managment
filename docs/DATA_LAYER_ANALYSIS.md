# 📊 Data Layer Analysis & Centralization Plan

## 🎯 Current Structure

```
src/data/
├── comments/
│   ├── get-comments.ts
│   └── index.ts
├── project/
│   ├── get-project-by-slug.ts
│   ├── get-project-members.ts
│   └── index.ts
├── task/
│   ├── get-all-subtasks.ts          ← Fetch ALL subtasks
│   ├── get-all-tasks-flat.ts        ← Fetch ALL tasks (flat)
│   ├── get-parent-tasks-only.ts     ← Fetch parent tasks (paginated)
│   ├── get-project-tasks.ts         ← Fetch tasks with subtasks (main)
│   ├── get-subtasks.ts              ← Fetch subtasks (paginated)
│   ├── get-task-by-id.ts            ← Fetch single task
│   ├── get-task-page-data.ts        ← Fetch page metadata
│   ├── get-tasks.ts                 ← Fetch tasks with nested subtasks
│   ├── index.ts                     ← Barrel export
│   └── revalidate-task-data.ts      ← Cache revalidation
├── user/
│   ├── get-user-permissions.ts
│   ├── get-workspace-member.ts
│   └── index.ts
└── workspace/
    ├── get-user-workspaces.ts
    ├── get-workspace-by-id.ts
    ├── get-workspace-members.ts
    └── index.ts
```

---

## 🔍 Duplication Analysis

### ❌ **Duplicated Functionality**

#### 1. **Task Fetching** (3 similar files!)

| File | Purpose | Duplication Level |
|------|---------|-------------------|
| `get-tasks.ts` | Parent tasks with nested subtasks | 🔴 High |
| `get-all-tasks-flat.ts` | All tasks as flat list | 🔴 High |
| `get-project-tasks.ts` | Tasks with subtasks (main) | 🔴 High |

**Problem**: All three do similar things with slight variations!

---

#### 2. **Subtask Fetching** (2 similar files!)

| File | Purpose | Duplication Level |
|------|---------|-------------------|
| `get-all-subtasks.ts` | All subtasks for a task | 🟡 Medium |
| `get-subtasks.ts` | Subtasks with pagination | 🟡 Medium |

**Problem**: Both fetch subtasks, one with pagination

---

#### 3. **Parent Task Fetching** (2 files!)

| File | Purpose | Duplication Level |
|------|---------|-------------------|
| `get-parent-tasks-only.ts` | Parent tasks (paginated) | 🟡 Medium |
| `get-project-tasks.ts` | Parent tasks with subtasks | 🟡 Medium |

**Problem**: Both fetch parent tasks with different nesting

---

## ✅ Recommended Centralization

### **Option 1: Keep Current Structure** (Recommended)

**Why?**
- Each file serves a specific use case
- Different views need different data shapes
- Performance optimized for each use case

**Action**: Just add better documentation

---

### **Option 2: Consolidate into Single File** (Not Recommended)

Create one `get-tasks.ts` with options:

```typescript
export async function getTasks(options: {
    projectId: string;
    workspaceId: string;
    includeSubtasks?: boolean;
    flat?: boolean;
    pagination?: { page: number; pageSize: number };
    parentOnly?: boolean;
}) {
    // Complex logic with many if/else
}
```

**Problems**:
- ❌ Too complex
- ❌ Hard to maintain
- ❌ Slower (loads unnecessary data)
- ❌ Type safety issues

---

## 🎯 **Recommended Actions**

### ✅ **Keep Separate Files** (Current is Good!)

Each file serves a specific purpose:

| File | Used By | Keep? |
|------|---------|-------|
| `get-project-tasks.ts` | Initial page load (server component) | ✅ Yes |
| `get-parent-tasks-only.ts` | Pagination (load more) | ✅ Yes |
| `get-subtasks.ts` | Expand task, load more subtasks | ✅ Yes |
| `get-all-tasks-flat.ts` | Gantt chart (flat structure) | ✅ Yes |
| `get-all-subtasks.ts` | Specific views needing all subtasks | ✅ Yes |
| `get-tasks.ts` | Legacy/alternative nested structure | ⚠️ Maybe remove |
| `get-task-by-id.ts` | Single task details | ✅ Yes |
| `get-task-page-data.ts` | Page metadata | ✅ Yes |

---

## 🔄 **Actual Duplications to Remove**

### ❌ **1. `get-tasks.ts` vs `get-project-tasks.ts`**

**Analysis**:
- Both fetch parent tasks with nested subtasks
- `get-project-tasks.ts` is newer and better
- `get-tasks.ts` might be legacy

**Action**: Check if `get-tasks.ts` is used anywhere

```bash
# Search for usage
grep -r "from \"@/data/task\"" src/
grep -r "getTasks" src/
```

**If not used**: ❌ DELETE `get-tasks.ts`

---

### ⚠️ **2. Similar Query Logic**

All files have similar:
- Authentication (`requireUser`)
- Permission checks (`getUserPermissions`)
- Role-based filtering
- Caching (`unstable_cache` + `cache`)

**Action**: Extract common patterns into shared utilities

---

## 📋 **Proposed Refactoring**

### **Step 1: Create Shared Utilities**

```typescript
// src/data/task/utils/auth.ts
export async function getAuthenticatedUser() {
    return await requireUser();
}

export async function validateProjectAccess(
    workspaceId: string,
    projectId: string
) {
    const user = await requireUser();
    const permissions = await getUserPermissions(workspaceId, projectId);
    
    if (!permissions.workspaceMemberId) {
        throw new Error("No access to project");
    }
    
    return { user, permissions };
}
```

```typescript
// src/data/task/utils/cache.ts
export function createTaskCache<T>(
    fn: () => Promise<T>,
    keys: string[],
    tags: string[]
) {
    return unstable_cache(fn, keys, {
        tags,
        revalidate: 60,
    })();
}
```

```typescript
// src/data/task/utils/where-clauses.ts
export function buildRoleBasedWhere(
    projectId: string,
    workspaceMemberId: string,
    isMember: boolean
) {
    return isMember
        ? {
            projectId,
            OR: [
                {
                    parentTaskId: null,
                    subTasks: {
                        some: {
                            assignee: {
                                workspaceMemberId,
                            },
                        },
                    },
                },
                {
                    parentTaskId: { not: null },
                    assignee: {
                        workspaceMemberId,
                    },
                },
            ],
        }
        : { projectId };
}
```

---

### **Step 2: Simplify Each File**

**Before** (Lots of duplication):
```typescript
export const getTasks = cache(async (projectId, workspaceId) => {
    const user = await requireUser();
    const permissions = await getUserPermissions(workspaceId, projectId);
    
    if (!permissions.workspaceMemberId) {
        throw new Error("No access");
    }
    
    const whereClause = isMember ? { /* complex */ } : { /* simple */ };
    
    return unstable_cache(
        async () => prisma.task.findMany({ where: whereClause }),
        [`tasks-${projectId}`],
        { tags: [`project-tasks-${projectId}`], revalidate: 60 }
    )();
});
```

**After** (Using utilities):
```typescript
export const getTasks = cache(async (projectId, workspaceId) => {
    const { user, permissions } = await validateProjectAccess(workspaceId, projectId);
    
    const whereClause = buildRoleBasedWhere(
        projectId,
        permissions.workspaceMemberId,
        permissions.isMember
    );
    
    return createTaskCache(
        () => prisma.task.findMany({ where: whereClause }),
        [`tasks-${projectId}-${user.id}`],
        [`project-tasks-${projectId}`, `project-tasks-user-${user.id}`]
    );
});
```

---

## ✅ **Final Recommendation**

### **Keep Current Structure!** ✅

**Why?**
1. ✅ Each file serves a specific use case
2. ✅ Performance optimized for each view
3. ✅ Type safety is better
4. ✅ Easier to understand
5. ✅ No major duplication issues

### **Minor Improvements**:
1. ✅ Add shared utilities for common patterns
2. ✅ Remove `get-tasks.ts` if unused
3. ✅ Better documentation
4. ✅ Consistent naming

---

## 📊 **Summary**

| Current Files | Status | Action |
|--------------|--------|--------|
| `get-project-tasks.ts` | ✅ Main | Keep |
| `get-parent-tasks-only.ts` | ✅ Pagination | Keep |
| `get-subtasks.ts` | ✅ Pagination | Keep |
| `get-all-tasks-flat.ts` | ✅ Gantt | Keep |
| `get-all-subtasks.ts` | ✅ Specific views | Keep |
| `get-task-by-id.ts` | ✅ Details | Keep |
| `get-task-page-data.ts` | ✅ Metadata | Keep |
| `get-tasks.ts` | ⚠️ Legacy? | Check usage, maybe remove |
| `revalidate-task-data.ts` | ✅ Cache | Keep |

**Total to Keep**: 8-9 files (depending on `get-tasks.ts` usage)

**Verdict**: Current structure is good! Just add utilities for common patterns. 🎯
