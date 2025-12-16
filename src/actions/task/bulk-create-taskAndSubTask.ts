"use server"

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateProjectTasks } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { generateUniqueSlugs } from "@/lib/slug-generator";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

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