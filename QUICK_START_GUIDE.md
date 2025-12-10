# Quick Start Implementation Guide
## Immediate Actions You Can Take Today

**Time Required**: 2-4 hours  
**Impact**: Massive improvement in code maintainability

---

## 🚀 STEP 1: Create New Folder Structure (5 minutes)

Run these commands in your terminal:

```bash
# Navigate to your project
cd c:\VamsiKrishna\Github\Tusker-managment

# Create actions folders
mkdir -p src\actions\task
mkdir -p src\actions\subtask
mkdir -p src\actions\comment
mkdir -p src\actions\workspace
mkdir -p src\actions\project
mkdir -p src\actions\auth

# Create services folders
mkdir -p src\services\task
mkdir -p src\services\comment

# Create lib reorganization
mkdir -p src\lib\cache
mkdir -p src\lib\prisma
mkdir -p src\lib\validation
mkdir -p src\lib\utils
mkdir -p src\lib\auth

# Create types folder
mkdir src\types
```

---

## 🎯 STEP 2: Quick Win #1 - Move Prisma Client (2 minutes)

### Create: `src/lib/prisma/client.ts`
```typescript
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = global as unknown as {
    prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma;
export { prisma };
```

### Update all imports:
```typescript
// OLD:
import prisma from "@/lib/db";

// NEW:
import prisma from "@/lib/prisma/client";
```

---

## 🎯 STEP 3: Quick Win #2 - Centralize Cache Invalidation (15 minutes)

### Create: `src/lib/cache/tags.ts`
```typescript
/**
 * Cache tag constants for consistent invalidation
 */
export const CACHE_TAGS = {
    // Workspace
    WORKSPACE: (id: string) => `workspace-${id}`,
    WORKSPACE_MEMBERS: (id: string) => `workspace-members-${id}`,
    
    // Project
    PROJECT: (id: string) => `project-${id}`,
    PROJECT_TASKS: (id: string) => `project-tasks-${id}`,
    PROJECT_MEMBERS: (id: string) => `project-members-${id}`,
    
    // Task
    TASK: (id: string) => `task-${id}`,
    TASK_SUBTASKS: (id: string) => `task-subtasks-${id}`,
    TASK_COMMENTS: (id: string) => `task-comments-${id}`,
    
    // Subtask
    SUBTASK: (id: string) => `subtask-${id}`,
    SUBTASK_REVIEWS: (id: string) => `review-comments-${id}`,
    
    // Global
    ALL_TASKS: 'tasks-all',
    ALL_COMMENTS: 'comments-all',
} as const;
```

### Create: `src/lib/cache/config.ts`
```typescript
/**
 * Cache revalidation times (in seconds)
 */
export const CACHE_REVALIDATE = {
    // Rarely changes
    WORKSPACE: 300,      // 5 minutes
    PROJECT: 300,        // 5 minutes
    PERMISSIONS: 300,    // 5 minutes
    
    // Moderate changes
    TASKS: 60,           // 1 minute
    SUBTASKS: 60,        // 1 minute
    
    // Frequent changes
    COMMENTS: 30,        // 30 seconds
    REVIEWS: 30,         // 30 seconds
} as const;
```

### Create: `src/lib/cache/invalidation.ts`
```typescript
"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "./tags";
import prisma from "@/lib/prisma/client";

/**
 * Centralized cache invalidation manager
 */
export class CacheManager {
    /**
     * Invalidate all caches related to a task
     */
    static async invalidateTask(taskId: string) {
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: {
                projectId: true,
                parentTaskId: true,
                project: {
                    select: {
                        workspaceId: true,
                        slug: true
                    }
                }
            }
        });

        if (!task) return;

        // Invalidate tags
        revalidateTag(CACHE_TAGS.TASK(taskId));
        revalidateTag(CACHE_TAGS.PROJECT_TASKS(task.projectId));
        revalidateTag(CACHE_TAGS.ALL_TASKS);

        if (task.parentTaskId) {
            revalidateTag(CACHE_TAGS.TASK_SUBTASKS(task.parentTaskId));
        }

        // Revalidate path
        revalidatePath(`/w/${task.project.workspaceId}/p/${task.project.slug}/task`);
    }

    /**
     * Invalidate all caches related to a project
     */
    static async invalidateProject(projectId: string) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: {
                workspaceId: true,
                slug: true
            }
        });

        if (!project) return;

        revalidateTag(CACHE_TAGS.PROJECT(projectId));
        revalidateTag(CACHE_TAGS.PROJECT_TASKS(projectId));
        revalidateTag(CACHE_TAGS.PROJECT_MEMBERS(projectId));
        revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);
    }

    /**
     * Invalidate comment caches
     */
    static async invalidateComments(taskId: string) {
        revalidateTag(CACHE_TAGS.TASK_COMMENTS(taskId));
        revalidateTag(CACHE_TAGS.TASK(taskId));
        revalidateTag(CACHE_TAGS.ALL_COMMENTS);
    }

    /**
     * Invalidate review comment caches
     */
    static async invalidateReviewComments(subTaskId: string) {
        revalidateTag(CACHE_TAGS.SUBTASK_REVIEWS(subTaskId));
        revalidateTag(CACHE_TAGS.SUBTASK(subTaskId));
    }
}

// Legacy exports for backward compatibility
export const invalidateProjectTasks = (projectId: string) => 
    revalidateTag(CACHE_TAGS.PROJECT_TASKS(projectId));

export const invalidateTaskSubTasks = (taskId: string) => 
    revalidateTag(CACHE_TAGS.TASK_SUBTASKS(taskId));

export const invalidateTaskComments = (taskId: string) => 
    CacheManager.invalidateComments(taskId);

export const invalidateReviewComments = (subTaskId: string) => 
    CacheManager.invalidateReviewComments(subTaskId);
```

---

## 🎯 STEP 4: Quick Win #3 - Split Large Action File (1-2 hours)

### Create: `src/actions/task/create-task.ts`
```typescript
"use server";

import prisma from "@/lib/prisma/client";
import { requireUser } from "@/app/data/user/require-user";
import { ApiResponse } from "@/lib/types";
import { taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { CacheManager } from "@/lib/cache/invalidation";

export async function createTask(values: TaskSchemaType): Promise<ApiResponse> {
    try {
        // 1. Validate input
        const validation = taskSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            };
        }

        // 2. Authenticate user
        await requireUser();

        // 3. Get project and verify access
        const project = await prisma.project.findUnique({
            where: { id: values.projectId },
            select: { workspaceId: true, slug: true }
        });

        if (!project) {
            return {
                status: "error",
                message: "Project not found",
            };
        }

        // 4. Check permissions
        const permissions = await getUserPermissions(project.workspaceId, values.projectId);

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // 5. Create task
        const newTask = await prisma.task.create({
            data: {
                name: validation.data.name,
                taskSlug: validation.data.taskSlug,
                projectId: validation.data.projectId,
                createdById: permissions.workspaceMember.id,
            },
            include: {
                _count: {
                    select: { subTasks: true }
                }
            }
        });

        // 6. Invalidate caches
        await CacheManager.invalidateProject(values.projectId);

        return {
            status: "success",
            message: "Task created successfully",
            data: newTask,
        };

    } catch (error) {
        console.error("Error creating task:", error);
        return {
            status: "error",
            message: "We couldn't create the task. Please try again.",
        };
    }
}
```

### Create: `src/actions/task/update-task.ts`
```typescript
"use server";

import prisma from "@/lib/prisma/client";
import { ApiResponse } from "@/lib/types";
import { taskSchema, TaskSchemaType } from "@/lib/zodSchemas";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { CacheManager } from "@/lib/cache/invalidation";

export async function updateTask(
    data: TaskSchemaType,
    taskId: string
): Promise<ApiResponse> {
    try {
        // 1. Validate input
        const validation = taskSchema.safeParse(data);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            };
        }

        // 2. Get existing task
        const existingTask = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                project: {
                    select: {
                        workspaceId: true,
                        slug: true,
                        id: true
                    }
                }
            }
        });

        if (!existingTask) {
            return {
                status: "error",
                message: "Task not found",
            };
        }

        // 3. Verify task belongs to project
        if (existingTask.projectId !== validation.data.projectId) {
            return {
                status: "error",
                message: "Task does not belong to this project",
            };
        }

        // 4. Check permissions
        const permissions = await getUserPermissions(
            existingTask.project.workspaceId,
            existingTask.project.id
        );

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        if (!permissions.canCreateSubTask) {
            return {
                status: "error",
                message: "You don't have permission to update tasks.",
            };
        }

        // 5. Check slug uniqueness if changed
        if (validation.data.taskSlug !== existingTask.taskSlug) {
            const existingSlug = await prisma.task.findUnique({
                where: { taskSlug: validation.data.taskSlug }
            });

            if (existingSlug) {
                return {
                    status: "error",
                    message: "A task with this slug already exists",
                };
            }
        }

        // 6. Update task
        await prisma.task.update({
            where: { id: taskId },
            data: {
                name: validation.data.name,
                taskSlug: validation.data.taskSlug,
            },
        });

        // 7. Invalidate caches
        await CacheManager.invalidateTask(taskId);

        return {
            status: "success",
            message: "Task updated successfully",
        };

    } catch (error) {
        console.error("Error updating task:", error);
        return {
            status: "error",
            message: "We couldn't update the task. Please try again.",
        };
    }
}
```

### Create: `src/actions/task/delete-task.ts`
```typescript
"use server";

import prisma from "@/lib/prisma/client";
import { ApiResponse } from "@/lib/types";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { CacheManager } from "@/lib/cache/invalidation";

export async function deleteTask(taskId: string): Promise<ApiResponse> {
    try {
        // 1. Get task with project info
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

        if (!existingTask) {
            return {
                status: "error",
                message: "Task not found",
            };
        }

        // 2. Check permissions
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

        // 3. Delete task (cascades to subtasks)
        await prisma.task.delete({
            where: { id: taskId },
        });

        // 4. Invalidate caches
        await CacheManager.invalidateProject(existingTask.projectId);

        return {
            status: "success",
            message: "Task deleted successfully",
        };

    } catch (error) {
        console.error("Error deleting task:", error);
        return {
            status: "error",
            message: "We couldn't delete the task. Please try again.",
        };
    }
}
```

### Create: `src/actions/task/index.ts` (Barrel Export)
```typescript
export { createTask } from './create-task';
export { updateTask } from './update-task';
export { deleteTask } from './delete-task';
export { bulkCreateTasks } from './bulk-create-tasks';
export { bulkDeleteTasks } from './bulk-delete-tasks';
```

---

## 🎯 STEP 5: Update Component Imports (10 minutes)

### Before:
```typescript
import { createTask, updateTask, deleteTask } from "../action";
```

### After:
```typescript
import { createTask, updateTask, deleteTask } from "@/actions/task";
```

---

## 📊 IMMEDIATE BENEFITS

After completing these steps, you'll have:

✅ **Organized Code Structure**
- Actions in `src/actions/*`
- Utilities in `src/lib/*`
- Clear separation of concerns

✅ **Centralized Cache Management**
- One place to manage all cache invalidation
- Consistent cache tags
- Easy to debug cache issues

✅ **Smaller Files**
- From 1034 lines → <100 lines per file
- Easier to review and maintain
- Better for code splitting

✅ **Better Performance**
- Centralized cache invalidation
- Consistent revalidation times
- Fewer cache misses

---

## 🔄 NEXT STEPS

After completing the quick wins:

1. **Week 1**: Continue splitting actions
   - Subtask actions
   - Comment actions
   - Workspace actions

2. **Week 2**: Optimize data layer
   - Add SELECT constants
   - Implement batch queries
   - Add parallel fetching

3. **Week 3**: Create service layer
   - Extract business logic
   - Make code testable
   - Improve reusability

4. **Week 4**: Testing & optimization
   - Performance testing
   - Bundle size analysis
   - Documentation

---

## 📝 TESTING CHECKLIST

After each change:

- [ ] Run `pnpm run dev` - No errors
- [ ] Test task creation
- [ ] Test task update
- [ ] Test task deletion
- [ ] Verify cache invalidation works
- [ ] Check network tab for duplicate queries

---

## 🆘 TROUBLESHOOTING

### Import errors after moving files?
```bash
# Clear Next.js cache
rm -rf .next
pnpm run dev
```

### TypeScript errors?
```bash
# Restart TypeScript server in VS Code
Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

### Cache not invalidating?
- Check cache tags match in both data layer and invalidation
- Verify revalidatePath uses actual values, not placeholders
- Check console for cache invalidation logs

---

**Start with Step 1 and work your way through. Each step builds on the previous one!**
