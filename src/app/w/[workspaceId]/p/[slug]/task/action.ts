"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";
import { ApiResponse } from "@/lib/types";
import { SubTaskSchemaType, taskSchema, TaskSchemaType, subTaskSchema } from "@/lib/zodSchemas";
import { revalidatePath } from "next/cache";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { invalidateProjectTasks, invalidateTaskSubTasks } from "@/app/data/user/invalidate-project-cache";

export async function createTask(values: TaskSchemaType): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        const validation = taskSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        // 1. Get the project to find the workspaceId
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

        // 2. Verify user is a member of the workspace using cached function
        const permissions = await getUserPermissions(project.workspaceId, values.projectId);

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // 3. Create the task
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

        // 4. Revalidate cache (path + task cache)
        revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);
        await invalidateProjectTasks(values.projectId);

        return {
            status: "success",
            message: "Task created successfully",
            data: newTask,
        };

    } catch {
        return {
            status: "error",
            message: "We couldn't create the task. Please try again.",
        }
    }
}

export async function createSubTask(values: SubTaskSchemaType): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        const validation = subTaskSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

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

        // Get user permissions using cached function
        const permissions = await getUserPermissions(project.workspaceId, values.projectId);

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // Check if user has permission to create subtasks (workspace admin or project lead)
        if (!permissions.canCreateSubTask) {
            return {
                status: "error",
                message: "You don't have permission to create subtasks. Only workspace admins and project leads can create subtasks.",
            };
        }

        let assigneeId: string | null = null;
        if (validation.data.assignee) {
            const assigneeProjectMember = await prisma.projectMember.findFirst({
                where: {
                    projectId: values.projectId,
                    workspaceMember: {
                        userId: validation.data.assignee
                    }
                }
            });
            if (assigneeProjectMember) {
                assigneeId = assigneeProjectMember.id;
            }
        }

        // Get parent task to create unique slug
        const parentTask = await prisma.task.findUnique({
            where: { id: validation.data.parentTaskId },
            select: { taskSlug: true }
        });

        if (!parentTask) {
            return {
                status: "error",
                message: "Parent task not found",
            };
        }

        // Create unique slug for subtask by combining parent slug with subtask slug
        const uniqueSubtaskSlug = `${parentTask.taskSlug}-${validation.data.taskSlug}`;

        const newSubTask = await prisma.task.create({
            data: {
                name: validation.data.name,
                taskSlug: uniqueSubtaskSlug, // Use unique slug
                description: validation.data.description,
                status: validation.data.status,
                projectId: validation.data.projectId,
                parentTaskId: validation.data.parentTaskId,
                createdById: permissions.workspaceMember.id,
                assigneeTo: assigneeId,
                tag: validation.data.tag,
                startDate: validation.data.startDate ? new Date(validation.data.startDate) : null,
                days: validation.data.days,
            },
            include: {
                assignee: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        surname: true,
                                        image: true,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        // Revalidate cache (path + task/subtask caches)
        revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);
        await invalidateProjectTasks(values.projectId);
        await invalidateTaskSubTasks(values.parentTaskId);

        return {
            status: "success",
            message: "Subtask created successfully",
            data: newSubTask,
        };

    } catch (err) {
        console.error("Error creating subtask:", err);
        return {
            status: "error",
            message: "We couldn't create the subtask. Please try again.",
        }
    }
}

export async function editTask(
    data: TaskSchemaType,
    taskId: string
): Promise<ApiResponse> {

    try {
        // Validate the input data
        const validation = taskSchema.safeParse(data);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        // Get the existing task to find the project
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

        // Verify the task belongs to the correct project
        if (existingTask.projectId !== validation.data.projectId) {
            return {
                status: "error",
                message: "Task does not belong to this project",
            };
        }

        // Verify user is a member of the workspace and get permissions using cached function
        const permissions = await getUserPermissions(existingTask.project.workspaceId, existingTask.project.id);

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // Check if user has permission to update tasks (workspace admin or project lead)
        if (!permissions.canCreateSubTask) {
            return {
                status: "error",
                message: "You don't have permission to update tasks. Only workspace admins and project leads can update tasks.",
            };
        }

        // Check if taskSlug is being changed and if it's unique
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

        // Update the task
        await prisma.task.update({
            where: { id: taskId },
            data: {
                name: validation.data.name,
                taskSlug: validation.data.taskSlug,
            },
        });

        // Revalidate cache (path + task cache)
        revalidatePath(`/w/${existingTask.project.workspaceId}/p/${existingTask.project.slug}/task`);
        await invalidateProjectTasks(existingTask.projectId);

        return {
            status: "success",
            message: "Task updated successfully",
        };

    } catch (err) {
        console.error("Error updating task:", err);
        return {
            status: "error",
            message: "We couldn't update the task. Please try again.",
        }
    }
}

export async function deleteTask(
    taskId: string
): Promise<ApiResponse> {

    try {
        // 1. Get the task with project and workspace info
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

        // 2. Check permissions - only workspace admin or project lead can delete tasks
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

        // 3. Delete the task (this will cascade delete all subtasks due to onDelete: Cascade in schema)
        await prisma.task.delete({
            where: { id: taskId },
        });

        // 4. Revalidate cache (path + task cache)
        revalidatePath(`/w/${existingTask.project.workspaceId}/p/${existingTask.project.slug}/task`);
        await invalidateProjectTasks(existingTask.projectId);

        return {
            status: "success",
            message: "Task deleted successfully",
        };

    } catch (err) {
        console.error("Error deleting task:", err);
        return {
            status: "error",
            message: "We couldn't delete the task. Please try again.",
        }
    }
}

export async function editSubTask(
    data: SubTaskSchemaType,
    subTaskId: string
): Promise<ApiResponse> {
    try {
        // Validate the input data
        const validation = subTaskSchema.safeParse(data);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        // Get the subtask with project and workspace info
        const existingSubTask = await prisma.task.findUnique({
            where: { id: subTaskId },
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

        if (!existingSubTask) {
            return {
                status: "error",
                message: "Subtask not found",
            };
        }

        // Check permissions
        const permissions = await getUserPermissions(
            existingSubTask.project.workspaceId,
            existingSubTask.project.id
        );

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // Get assignee ID if provided
        let assigneeId: string | null = null;
        if (validation.data.assignee) {
            const assignee = await prisma.projectMember.findFirst({
                where: {
                    projectId: validation.data.projectId,
                    workspaceMember: {
                        user: {
                            id: validation.data.assignee
                        }
                    }
                },
                select: { id: true }
            });

            if (assignee) {
                assigneeId = assignee.id;
            }
        }

        // Update the subtask
        await prisma.task.update({
            where: { id: subTaskId },
            data: {
                name: validation.data.name,
                description: validation.data.description,
                assigneeTo: assigneeId,
                tag: validation.data.tag,
                startDate: validation.data.startDate ? new Date(validation.data.startDate) : null,
                days: validation.data.days,
            },
        });

        // Revalidate cache (path + subtask cache)
        revalidatePath(`/w/${existingSubTask.project.workspaceId}/p/${existingSubTask.project.slug}/task`);
        if (existingSubTask.parentTaskId) {
            await invalidateTaskSubTasks(existingSubTask.parentTaskId);
        }
        await invalidateProjectTasks(existingSubTask.projectId);

        return {
            status: "success",
            message: "Subtask updated successfully",
        };

    } catch (err) {
        console.error("Error updating subtask:", err);
        return {
            status: "error",
            message: "We couldn't update the subtask. Please try again.",
        }
    }
}

export async function deleteSubTask(
    subTaskId: string
): Promise<ApiResponse> {
    try {
        // Get the subtask with project and workspace info
        const existingSubTask = await prisma.task.findUnique({
            where: { id: subTaskId },
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

        if (!existingSubTask) {
            return {
                status: "error",
                message: "Subtask not found",
            };
        }

        // Check permissions - only workspace admin or project lead can delete subtasks
        const permissions = await getUserPermissions(
            existingSubTask.project.workspaceId,
            existingSubTask.project.id
        );

        if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
            return {
                status: "error",
                message: "You don't have permission to delete this subtask",
            };
        }

        // Delete the subtask
        await prisma.task.delete({
            where: { id: subTaskId },
        });

        // Revalidate cache (path + subtask cache)
        revalidatePath(`/w/${existingSubTask.project.workspaceId}/p/${existingSubTask.project.slug}/task`);
        if (existingSubTask.parentTaskId) {
            await invalidateTaskSubTasks(existingSubTask.parentTaskId);
        }
        await invalidateProjectTasks(existingSubTask.projectId);

        return {
            status: "success",
            message: "Subtask deleted successfully",
        };

    } catch (err) {
        console.error("Error deleting subtask:", err);
        return {
            status: "error",
            message: "We couldn't delete the subtask. Please try again.",
        }
    }
}
