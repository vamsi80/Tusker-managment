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
        reviewerEmail?: string;
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
                            select: { email: true, id: true }
                        }
                    }
                }
            }
        });

        // Create email to member ID mapping
        const emailToMemberId = new Map(
            projectMembers.map(pm => [
                pm.workspaceMember.user.email.toLowerCase(),
                pm.workspaceMember.user.id
            ])
        );

        // Validate assignee and reviewer emails BEFORE starting the transaction
        const invalidAssigneeEmails: string[] = [];
        const invalidReviewerEmails: string[] = [];
        const uniqueAssigneeEmails = new Set<string>();
        const uniqueReviewerEmails = new Set<string>();

        for (const task of data.tasks) {
            if (task.assigneeEmail && task.assigneeEmail.trim()) {
                uniqueAssigneeEmails.add(task.assigneeEmail.trim().toLowerCase());
            }
            if (task.reviewerEmail && task.reviewerEmail.trim()) {
                uniqueReviewerEmails.add(task.reviewerEmail.trim().toLowerCase());
            }
        }

        for (const email of uniqueAssigneeEmails) {
            if (!emailToMemberId.has(email)) {
                invalidAssigneeEmails.push(email);
            }
        }

        for (const email of uniqueReviewerEmails) {
            if (!emailToMemberId.has(email)) {
                invalidReviewerEmails.push(email);
            }
        }

        if (invalidAssigneeEmails.length > 0) {
            return {
                status: "error",
                message: `The following assignee email(s) are not members of this project: ${invalidAssigneeEmails.join(', ')}. Please add them to the project first or remove them from the CSV file.`,
            };
        }

        if (invalidReviewerEmails.length > 0) {
            return {
                status: "error",
                message: `The following reviewer email(s) are not members of this project: ${invalidReviewerEmails.join(', ')}. Please add them to the project first or remove them from the CSV file.`,
            };
        }

        // Validate dates and days BEFORE starting the transaction
        const invalidDates: string[] = [];
        const invalidDays: string[] = [];

        for (let i = 0; i < data.tasks.length; i++) {
            const task = data.tasks[i];
            const rowNum = i + 2; // +2 because row 1 is header, and array is 0-indexed

            // Check for invalid dates
            if (task.startDate && task.startDate.trim()) {
                const date = new Date(task.startDate);
                if (isNaN(date.getTime())) {
                    invalidDates.push(`Row ${rowNum}: "${task.startDate}" (Task: ${task.taskName}${task.subtaskName ? ` - ${task.subtaskName}` : ''})`);
                }
            }

            // Check for invalid days
            if (task.days !== undefined && task.days !== null) {
                const daysNum = typeof task.days === 'number' ? task.days : parseInt(String(task.days));
                if (isNaN(daysNum) || daysNum < 0) {
                    invalidDays.push(`Row ${rowNum}: "${task.days}" (Task: ${task.taskName}${task.subtaskName ? ` - ${task.subtaskName}` : ''})`);
                }
            }
        }

        if (invalidDates.length > 0) {
            return {
                status: "error",
                message: `Invalid date format found in the following rows. Please use YYYY-MM-DD format (e.g., 2024-12-20):\n${invalidDates.join('\n')}`,
            };
        }

        if (invalidDays.length > 0) {
            return {
                status: "error",
                message: `Invalid days value found in the following rows. Please use positive numbers only:\n${invalidDays.join('\n')}`,
            };
        }

        // Group tasks by task name
        const taskGroups = new Map<string, typeof data.tasks>();
        for (const task of data.tasks) {
            const existing = taskGroups.get(task.taskName) || [];
            taskGroups.set(task.taskName, [...existing, task]);
        }

        const createdItems: any[] = [];
        const errors: string[] = [];

        // Pre-generate all slugs BEFORE the transaction to improve performance
        const taskNames = Array.from(taskGroups.keys());
        const taskSlugs = await generateUniqueSlugs(taskNames, 'task');
        const taskSlugMap = new Map(taskNames.map((name, i) => [name, taskSlugs[i]]));

        // Pre-generate subtask slugs
        const allSubtaskNames: string[] = [];
        const subtaskNameToTaskName = new Map<string, string>();

        for (const [taskName, taskGroup] of taskGroups.entries()) {
            const subtaskRows = taskGroup.filter(t => t.subtaskName);
            for (const row of subtaskRows) {
                if (row.subtaskName) {
                    allSubtaskNames.push(row.subtaskName);
                    subtaskNameToTaskName.set(row.subtaskName, taskName);
                }
            }
        }

        const allSubtaskSlugs = allSubtaskNames.length > 0
            ? await generateUniqueSlugs(allSubtaskNames, 'task', undefined, taskSlugs)
            : [];
        // Removed subtaskSlugMap as it causes issues with duplicate subtask names
        // Used sequential index instead (see below)

        // Fetch all workspace tags for resolution
        const workspaceTags = await prisma.tag.findMany({
            where: { workspaceId: project.workspaceId },
            select: { id: true, name: true, requirePurchase: true }
        });

        const tagMap = new Map(
            workspaceTags.map(t => [t.name.toUpperCase(), t])
        );

        // Process each task group in a transaction with increased timeout
        let globalSubtaskIndex = 0;

        await prisma.$transaction(async (tx) => {
            for (const [taskName, taskGroup] of taskGroups.entries()) {
                // Get pre-generated slug
                const taskSlug = taskSlugMap.get(taskName)!;

                // Create parent task - ONLY NAME, no other fields
                const parentTask = await tx.task.create({
                    data: {
                        name: taskName,
                        taskSlug: taskSlug,
                        projectId: data.projectId,
                        workspaceId: project.workspaceId,
                        createdById: permissions.workspaceMember.userId,
                    },
                });

                createdItems.push({ type: 'task', name: taskName });

                // Create subtasks
                const subtaskRows = taskGroup.filter(t => t.subtaskName);

                if (subtaskRows.length > 0) {
                    // Validation arrays for subtasks
                    const validStatus = ['TO_DO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED', 'HOLD'];

                    for (let i = 0; i < subtaskRows.length; i++) {
                        const subtaskRow = subtaskRows[i];

                        // Get pre-generated slug for this subtask using sequential index
                        const subtaskSlug = allSubtaskSlugs[globalSubtaskIndex++];

                        const subtaskAssigneeId = subtaskRow.assigneeEmail
                            ? emailToMemberId.get(subtaskRow.assigneeEmail.trim().toLowerCase())
                            : undefined;

                        // Default reviewer to creator if not specified
                        const subtaskReviewerId = subtaskRow.reviewerEmail
                            ? emailToMemberId.get(subtaskRow.reviewerEmail.trim().toLowerCase())
                            : permissions.workspaceMember.userId;

                        const subtaskStartDate = subtaskRow.startDate
                            ? new Date(subtaskRow.startDate)
                            : undefined;

                        const subtaskStatus = subtaskRow.status && validStatus.includes(subtaskRow.status)
                            ? subtaskRow.status
                            : 'TO_DO';

                        // Resolve tag ID and check procurement requirement
                        let resolvedTagId: string | undefined = undefined;
                        let shouldAddToProcurement = false;

                        if (subtaskRow.tag) {
                            const tagInfo = tagMap.get(subtaskRow.tag.toUpperCase());
                            if (tagInfo) {
                                resolvedTagId = tagInfo.id;
                                shouldAddToProcurement = tagInfo.requirePurchase === true;
                            }
                        }

                        const createdSubtask = await tx.task.create({
                            data: {
                                name: subtaskRow.subtaskName!,
                                taskSlug: subtaskSlug,
                                description: subtaskRow.description,
                                projectId: data.projectId,
                                workspaceId: project.workspaceId,
                                createdById: permissions.workspaceMember.userId,
                                parentTaskId: parentTask.id,
                                assigneeTo: subtaskAssigneeId,
                                reviewerId: subtaskReviewerId,
                                startDate: subtaskStartDate,
                                days: subtaskRow.days,
                                status: subtaskStatus as any,
                                tagId: resolvedTagId,
                            },
                        });

                        if (shouldAddToProcurement) {
                            await tx.procurementTask.create({
                                data: {
                                    taskId: createdSubtask.id,
                                    projectId: data.projectId,
                                    workspaceId: project.workspaceId,
                                },
                            });
                        }

                        createdItems.push({ type: 'subtask', name: subtaskRow.subtaskName });
                    }
                }
            }
        }, {
            timeout: 30000, // 30 seconds timeout for large bulk uploads
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

    } catch (err: any) {
        console.error("Error bulk uploading tasks:", err);

        // Provide specific error messages for common issues
        if (err.code === 'P2002') {
            // Unique constraint violation
            const field = err.meta?.target?.[0] || 'field';
            return {
                status: "error",
                message: `Duplicate ${field} found. Please ensure all task and subtask names are unique.`,
            };
        }

        if (err.code === 'P2003') {
            // Foreign key constraint violation
            return {
                status: "error",
                message: "Invalid assignee email or project member not found. Please check that all assignees are members of the project.",
            };
        }

        if (err.code === 'P2025') {
            // Record not found
            return {
                status: "error",
                message: "Project or workspace not found. Please refresh and try again.",
            };
        }

        // Check for PostgreSQL UTF-8 encoding errors (null bytes)
        if (err.message?.includes('22021') || err.message?.includes('invalid byte sequence')) {
            return {
                status: "error",
                message: "Your CSV file contains invalid characters. Please re-save your CSV file in UTF-8 encoding without BOM, or try copying the data to a new file.",
            };
        }

        // Generic error with more details
        const errorMessage = err.message || "Unknown error occurred";
        return {
            status: "error",
            message: `Failed to upload tasks: ${errorMessage}`,
        };
    }
}