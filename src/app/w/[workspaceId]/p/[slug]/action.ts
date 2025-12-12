"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";
import { ApiResponse } from "@/lib/types";
import { SubTaskSchemaType, taskSchema, TaskSchemaType, subTaskSchema } from "@/lib/zodSchemas";
import { revalidatePath } from "next/cache";
import { getUserPermissions } from "@/app/data/user/get-user-permissions";
import { invalidateProjectTasks, invalidateTaskSubTasks } from "@/app/data/user/invalidate-project-cache";
import { generateUniqueSlugs } from "@/lib/slug-generator";

export async function createTask(values: TaskSchemaType): Promise<ApiResponse> {
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

// export async function bulkCreateTasks(data: {
//     projectId: string;
//     tasks: { name: string; taskSlug: string }[];
// }): Promise<ApiResponse> {
//     const user = await requireUser();

//     try {
//         if (!data.tasks || data.tasks.length === 0) {
//             return {
//                 status: "error",
//                 message: "No tasks provided"
//             };
//         }

//         // Validate each task
//         for (const task of data.tasks) {
//             if (!task.name || !task.taskSlug) {
//                 return {
//                     status: "error",
//                     message: "All tasks must have a name and slug"
//                 };
//             }
//         }

//         // 1. Get the project to find the workspaceId
//         const project = await prisma.project.findUnique({
//             where: { id: data.projectId },
//             select: { workspaceId: true, slug: true }
//         });

//         if (!project) {
//             return {
//                 status: "error",
//                 message: "Project not found",
//             };
//         }

//         // 2. Verify user is a member of the workspace using cached function
//         const permissions = await getUserPermissions(project.workspaceId, data.projectId);

//         if (!permissions.workspaceMember) {
//             return {
//                 status: "error",
//                 message: "You are not a member of this workspace",
//             };
//         }

//         // 3. Check for duplicate slugs in the database
//         const slugs = data.tasks.map(t => t.taskSlug);
//         const existingSlugs = await prisma.task.findMany({
//             where: {
//                 taskSlug: { in: slugs }
//             },
//             select: { taskSlug: true }
//         });

//         if (existingSlugs.length > 0) {
//             return {
//                 status: "error",
//                 message: `The following slugs already exist: ${existingSlugs.map(s => s.taskSlug).join(", ")}`,
//             };
//         }

//         // 4. Create all tasks in a transaction
//         const createdTasks = await prisma.$transaction(
//             data.tasks.map(task =>
//                 prisma.task.create({
//                     data: {
//                         name: task.name,
//                         taskSlug: task.taskSlug,
//                         projectId: data.projectId,
//                         createdById: permissions.workspaceMember.id,
//                     },
//                     include: {
//                         _count: {
//                             select: { subTasks: true }
//                         }
//                     }
//                 })
//             )
//         );

//         // 5. Revalidate cache (path + task cache)
//         revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);
//         await invalidateProjectTasks(data.projectId);

//         return {
//             status: "success",
//             message: `${createdTasks.length} tasks created successfully`,
//             data: createdTasks,
//         };

//     } catch (err) {
//         console.error("Error bulk creating tasks:", err);
//         return {
//             status: "error",
//             message: "We couldn't create the tasks. Please try again.",
//         }
//     }
// }

/**
 * Bulk upload tasks and subtasks from CSV/Excel file
 * Handles both parent tasks and subtasks in a single upload
 */
export async function bulkUploadTasksAndSubtasks(data: {
    projectId: string;
    tasks: Array<{
        taskName: string;
        subtaskName?: string;
        description?: string;
        assigneeEmail?: string;
        startDate?: string;
        days?: number;
        status?: string;
        tag?: string;
    }>;
}): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        if (!data.tasks || data.tasks.length === 0) {
            return {
                status: "error",
                message: "No tasks provided"
            };
        }

        // Get project and verify permissions
        const project = await prisma.project.findUnique({
            where: { id: data.projectId },
            select: { workspaceId: true, slug: true }
        });

        if (!project) {
            return {
                status: "error",
                message: "Project not found",
            };
        }

        const permissions = await getUserPermissions(project.workspaceId, data.projectId);

        if (!permissions.workspaceMember) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        // Get all project members for assignee lookup
        const projectMembers = await prisma.projectMember.findMany({
            where: { projectId: data.projectId },
            include: {
                workspaceMember: {
                    include: {
                        user: {
                            select: { email: true }
                        }
                    }
                }
            }
        });

        // Create email to member ID mapping
        const emailToMemberId = new Map(
            projectMembers.map(pm => [
                pm.workspaceMember.user.email,
                pm.id
            ])
        );

        // Group tasks by task name
        const taskGroups = new Map<string, typeof data.tasks>();
        for (const task of data.tasks) {
            const existing = taskGroups.get(task.taskName) || [];
            taskGroups.set(task.taskName, [...existing, task]);
        }

        const createdItems: any[] = [];
        const errors: string[] = [];

        // Process each task group in a transaction
        await prisma.$transaction(async (tx) => {
            for (const [taskName, taskGroup] of taskGroups.entries()) {
                try {
                    // Find the parent task row (no subtask name) or use first row
                    const parentRow = taskGroup.find(t => !t.subtaskName) || taskGroup[0];

                    // Generate unique slug for parent task
                    const taskSlug = await generateUniqueSlugs([taskName], 'task');

                    // Create parent task - ONLY NAME, no other fields
                    const parentTask = await tx.task.create({
                        data: {
                            name: taskName,
                            taskSlug: taskSlug[0],
                            projectId: data.projectId,
                            createdById: permissions.workspaceMember.id,
                        },
                    });

                    createdItems.push({ type: 'task', name: taskName });

                    // Create subtasks
                    const subtaskRows = taskGroup.filter(t => t.subtaskName);

                    if (subtaskRows.length > 0) {
                        // Validation arrays for subtasks
                        const validStatus = ['TO_DO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'BLOCKED', 'HOLD'];
                        const validTags = ['DESIGN', 'PROCUREMENT', 'CONTRACTOR'];

                        const subtaskSlugs = await generateUniqueSlugs(
                            subtaskRows.map(t => t.subtaskName!),
                            'task'
                        );

                        for (let i = 0; i < subtaskRows.length; i++) {
                            const subtaskRow = subtaskRows[i];

                            const subtaskAssigneeId = subtaskRow.assigneeEmail
                                ? emailToMemberId.get(subtaskRow.assigneeEmail)
                                : undefined;

                            const subtaskStartDate = subtaskRow.startDate
                                ? new Date(subtaskRow.startDate)
                                : undefined;

                            const subtaskStatus = subtaskRow.status && validStatus.includes(subtaskRow.status)
                                ? subtaskRow.status
                                : 'TO_DO';

                            const subtaskTag = subtaskRow.tag && validTags.includes(subtaskRow.tag)
                                ? subtaskRow.tag
                                : undefined;

                            await tx.task.create({
                                data: {
                                    name: subtaskRow.subtaskName!,
                                    taskSlug: subtaskSlugs[i],
                                    description: subtaskRow.description,
                                    projectId: data.projectId,
                                    createdById: permissions.workspaceMember.id,
                                    parentTaskId: parentTask.id,
                                    assigneeTo: subtaskAssigneeId,
                                    startDate: subtaskStartDate,
                                    days: subtaskRow.days,
                                    status: subtaskStatus as any,
                                    tag: subtaskTag as any,
                                },
                            });

                            createdItems.push({ type: 'subtask', name: subtaskRow.subtaskName });
                        }
                    }
                } catch (error) {
                    console.error(`Error creating task group "${taskName}":`, error);
                    errors.push(`Failed to create "${taskName}"`);
                }
            }
        });

        // Revalidate cache
        revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);
        await invalidateProjectTasks(data.projectId);

        const taskCount = createdItems.filter(i => i.type === 'task').length;
        const subtaskCount = createdItems.filter(i => i.type === 'subtask').length;

        let message = `Successfully created ${taskCount} task${taskCount !== 1 ? 's' : ''}`;
        if (subtaskCount > 0) {
            message += ` and ${subtaskCount} subtask${subtaskCount !== 1 ? 's' : ''}`;
        }
        if (errors.length > 0) {
            message += `. Errors: ${errors.join(', ')}`;
        }

        return {
            status: "success",
            message,
            data: createdItems,
        };

    } catch (err) {
        console.error("Error bulk uploading tasks:", err);
        return {
            status: "error",
            message: "We couldn't upload the tasks. Please try again.",
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

// export async function bulkCreateSubTasks(data: {
//     projectId: string;
//     parentTaskId: string;
//     subTasks: {
//         name: string;
//         taskSlug: string;
//         description?: string;
//         tag?: "DESIGN" | "PROCUREMENT" | "CONTRACTOR";
//         startDate?: string;
//         days?: number;
//         assignee?: string;
//         status: "TO_DO" | "IN_PROGRESS" | "COMPLETED";
//     }[];
// }): Promise<ApiResponse> {
//     const user = await requireUser();

//     try {
//         if (!data.subTasks || data.subTasks.length === 0) {
//             return {
//                 status: "error",
//                 message: "No subtasks provided"
//             };
//         }

//         // Validate each subtask
//         for (const subTask of data.subTasks) {
//             if (!subTask.name || !subTask.taskSlug) {
//                 return {
//                     status: "error",
//                     message: "All subtasks must have a name and slug"
//                 };
//             }
//         }

//         // Get the project
//         const project = await prisma.project.findUnique({
//             where: { id: data.projectId },
//             select: { workspaceId: true, slug: true }
//         });

//         if (!project) {
//             return {
//                 status: "error",
//                 message: "Project not found",
//             };
//         }

//         // Get user permissions
//         const permissions = await getUserPermissions(project.workspaceId, data.projectId);

//         if (!permissions.workspaceMember) {
//             return {
//                 status: "error",
//                 message: "You are not a member of this workspace",
//             };
//         }

//         // Check if user has permission to create subtasks
//         if (!permissions.canCreateSubTask) {
//             return {
//                 status: "error",
//                 message: "You don't have permission to create subtasks. Only workspace admins and project leads can create subtasks.",
//             };
//         }

//         // Get parent task to create unique slugs
//         const parentTask = await prisma.task.findUnique({
//             where: { id: data.parentTaskId },
//             select: { taskSlug: true }
//         });

//         if (!parentTask) {
//             return {
//                 status: "error",
//                 message: "Parent task not found",
//             };
//         }

//         // Create unique slugs and check for duplicates in database
//         const uniqueSlugs = data.subTasks.map(st => `${parentTask.taskSlug}-${st.taskSlug}`);

//         // Get all existing slugs that start with any of our base slugs
//         const baseSlugPatterns = [...new Set(uniqueSlugs)];
//         const existingSlugs = await prisma.task.findMany({
//             where: {
//                 OR: baseSlugPatterns.map(baseSlug => ({
//                     taskSlug: {
//                         startsWith: baseSlug
//                     }
//                 }))
//             },
//             select: { taskSlug: true }
//         });

//         const existingSlugSet = new Set(existingSlugs.map(s => s.taskSlug));

//         // Generate unique slugs by appending numbers if conflicts exist
//         const finalSlugs = uniqueSlugs.map(slug => {
//             if (!existingSlugSet.has(slug)) {
//                 return slug; // No conflict, use original
//             }

//             // Find next available number
//             let counter = 1;
//             let newSlug = `${slug}-${counter}`;
//             while (existingSlugSet.has(newSlug)) {
//                 counter++;
//                 newSlug = `${slug}-${counter}`;
//             }

//             // Add to set to prevent duplicates within this batch
//             existingSlugSet.add(newSlug);
//             return newSlug;
//         });


//         // Resolve assignees
//         const subTasksWithAssignees = await Promise.all(
//             data.subTasks.map(async (subTask, index) => {
//                 let assigneeId: string | null = null;
//                 if (subTask.assignee) {
//                     const assigneeProjectMember = await prisma.projectMember.findFirst({
//                         where: {
//                             projectId: data.projectId,
//                             workspaceMember: {
//                                 userId: subTask.assignee
//                             }
//                         }
//                     });
//                     if (assigneeProjectMember) {
//                         assigneeId = assigneeProjectMember.id;
//                     }
//                 }
//                 return {
//                     ...subTask,
//                     assigneeId,
//                     uniqueSlug: finalSlugs[index] // Use the unique slug from finalSlugs
//                 };
//             })
//         );


//         // Create all subtasks in a transaction
//         const createdSubTasks = await prisma.$transaction(
//             subTasksWithAssignees.map(subTask =>
//                 prisma.task.create({
//                     data: {
//                         name: subTask.name,
//                         taskSlug: subTask.uniqueSlug,
//                         description: subTask.description,
//                         status: subTask.status,
//                         projectId: data.projectId,
//                         parentTaskId: data.parentTaskId,
//                         createdById: permissions.workspaceMember.id,
//                         assigneeTo: subTask.assigneeId,
//                         tag: subTask.tag,
//                         startDate: subTask.startDate ? new Date(subTask.startDate) : null,
//                         days: subTask.days,
//                     },
//                     include: {
//                         assignee: {
//                             include: {
//                                 workspaceMember: {
//                                     include: {
//                                         user: {
//                                             select: {
//                                                 id: true,
//                                                 name: true,
//                                                 surname: true,
//                                                 image: true,
//                                             }
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     }
//                 })
//             )
//         );

//         // Revalidate cache
//         revalidatePath(`/w/${project.workspaceId}/p/${project.slug}/task`);
//         await invalidateProjectTasks(data.projectId);
//         await invalidateTaskSubTasks(data.parentTaskId);

//         return {
//             status: "success",
//             message: `${createdSubTasks.length} subtasks created successfully`,
//             data: createdSubTasks,
//         };

//     } catch (err) {
//         console.error("Error bulk creating subtasks:", err);
//         return {
//             status: "error",
//             message: "We couldn't create the subtasks. Please try again.",
//         }
//     }
// }

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
