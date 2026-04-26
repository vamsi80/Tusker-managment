"use server"

import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateTaskMutation } from "@/lib/cache/invalidation";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { generateUniqueSlugs } from "@/lib/slug-generator";
import { ApiResponse } from "@/lib/types";
import { parseIST } from "@/lib/utils";

function calculateDueDate(startDate: Date | undefined, days: number | undefined): Date | undefined {
    if (!startDate || days === undefined || days === null) return undefined;
    // Add days as milliseconds to stay timezone-agnostic for the duration calculation
    const dueDate = new Date(startDate.getTime() + (Number(days) * 24 * 60 * 60 * 1000));
    return dueDate;
}

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
        tags?: string[];
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

        const permissions = await getUserPermissions(project.workspaceId, data.projectId, user.id);

        if (!permissions.workspaceMemberId) {
            return {
                status: "error",
                message: "You are not a member of this workspace",
            };
        }

        const projectMembers = await prisma.projectMember.findMany({
            where: { projectId: data.projectId },
            include: {
                workspaceMember: {
                    include: {
                        user: {
                            select: { email: true, id: true, surname: true }
                        }
                    }
                }
            }
        });

        // Map email → ProjectMember.id (not User.id)
        const emailToProjectMemberId = new Map<string, string>();
        const emailToSurname = new Map<string, string>();
        const pmIdToSurname = new Map<string, string>();

        for (const pm of projectMembers) {
            const email = pm.workspaceMember.user.email.toLowerCase();
            const surname = pm.workspaceMember.user.surname || "";

            emailToProjectMemberId.set(email, pm.id);
            emailToSurname.set(email, surname);
            pmIdToSurname.set(pm.id, surname);
        }

        // Find or create current user's ProjectMember.id
        let creatorProjectMemberId = permissions.projectMember?.id;

        // If not found by direct ID (permissions), try resolving by email from the fetched project members
        if (!creatorProjectMemberId && user.email) {
            creatorProjectMemberId = emailToProjectMemberId.get(user.email.toLowerCase());
        }

        // If STILL not found but user is Workspace Admin/Owner/Manager, automatically join them
        if (!creatorProjectMemberId && (permissions.isWorkspaceAdmin || permissions.isProjectManager)) {
            // Self-join the admin to the project so they can be the creator
            const newMember = await prisma.projectMember.create({
                data: {
                    projectId: data.projectId,
                    workspaceMemberId: permissions.workspaceMemberId!,
                    projectRole: permissions.isWorkspaceAdmin ? "PROJECT_MANAGER" : "MEMBER",
                    hasAccess: true,
                }
            });
            creatorProjectMemberId = newMember.id;
        }

        if (!creatorProjectMemberId) {
            return {
                status: "error",
                message: "You are not a member of this project and don't have permission to join automatically.",
            };
        }
        const emailToMemberId = emailToProjectMemberId;
        const invalidAssigneeRows: string[] = [];
        const invalidReviewerRows: string[] = [];

        for (let i = 0; i < data.tasks.length; i++) {
            const task = data.tasks[i];
            const rowNum = i + 2; // +1 for 0-index, +1 for header

            if (task.assigneeEmail && task.assigneeEmail.trim()) {
                const email = task.assigneeEmail.trim().toLowerCase();
                if (!emailToMemberId.has(email)) {
                    invalidAssigneeRows.push(`Row ${rowNum}: ${email}`);
                }
            }

            if (task.reviewerEmail && task.reviewerEmail.trim()) {
                const email = task.reviewerEmail.trim().toLowerCase();
                if (!emailToMemberId.has(email)) {
                    invalidReviewerRows.push(`Row ${rowNum}: ${email}`);
                }
            }
        }

        if (invalidAssigneeRows.length > 0) {
            return {
                status: "error",
                message: `The following assignee email(s) are not members of this project:\n${invalidAssigneeRows.join('\n')}\n\nPlease add them to the project first or remove them from your file.`,
            };
        }

        if (invalidReviewerRows.length > 0) {
            return {
                status: "error",
                message: `The following reviewer email(s) are not members of this project:\n${invalidReviewerRows.join('\n')}\n\nPlease add them to the project first or remove them from your file.`,
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
                const date = parseIST(task.startDate);
                if (!date || isNaN(date.getTime())) {
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
                message: `Invalid date format found in the following rows. Please use 'd MMM yyyy' format (e.g., 15 Apr 2026):\n${invalidDates.join('\n')}`,
            };
        }

        if (invalidDays.length > 0) {
            return {
                status: "error",
                message: `Invalid days value found in the following rows. Please use positive numbers only:\n${invalidDays.join('\n')}`,
            };
        }

        // Group tasks by task name, filtering out any empty/invalid rows
        const taskGroups = new Map<string, typeof data.tasks>();
        for (const task of data.tasks) {
            // Skip rows with no task name (shouldn't happen due to frontend validation)
            if (!task.taskName?.trim()) continue;
            
            // Normalize task name to handle multiple spaces
            const normalizedTaskName = task.taskName.trim().replace(/\s+/g, ' ');
            
            const existing = taskGroups.get(normalizedTaskName) || [];
            taskGroups.set(normalizedTaskName, [...existing, task]);
        }
        
        // Filter out task groups that only contain empty placeholder rows
        // (rows with no subtask name, no description, no assignee, no dates)
        for (const [taskName, taskGroup] of taskGroups.entries()) {
            const hasValidRow = taskGroup.some(row => 
                row.subtaskName?.trim() || 
                row.description?.trim() || 
                row.assigneeEmail?.trim() ||
                row.reviewerEmail?.trim() ||
                row.startDate?.trim() ||
                row.days !== undefined ||
                row.status?.trim() ||
                (row.tags && row.tags.length > 0)
            );
            if (!hasValidRow) {
                taskGroups.delete(taskName);
            }
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

        // Fetch all workspace tags for resolution
        const workspaceTags = await prisma.tag.findMany({
            where: { workspaceId: project.workspaceId },
            select: { id: true, name: true, requirePurchase: true }
        });

        const tagMap = new Map(
            workspaceTags.map(t => [t.name.toUpperCase(), t])
        );

        // Process each task group in a transaction with increased timeout
        const lastParentTask = await prisma.task.findFirst({
            where: { projectId: data.projectId, isParent: true },
            orderBy: { position: 'desc' },
            select: { position: true }
        });
        
        let parentTaskIndex = lastParentTask?.position || 0;
        let globalSubtaskIndex = 0;

        await prisma.$transaction(async (tx) => {
            for (const [taskName, taskGroup] of taskGroups.entries()) {
                const taskSlug = taskSlugMap.get(taskName)!;
                const firstRow = taskGroup[0];
                parentTaskIndex++;

                // Resolve parent task fields
                const parentAssigneeId = firstRow.assigneeEmail
                    ? emailToMemberId.get(firstRow.assigneeEmail.trim().toLowerCase())
                    : undefined;

                const parentReviewerId = firstRow.reviewerEmail
                    ? emailToMemberId.get(firstRow.reviewerEmail.trim().toLowerCase())
                    : creatorProjectMemberId;

                const parentStartDate = firstRow.startDate
                    ? parseIST(firstRow.startDate) || undefined
                    : undefined;

                const parentTagIds: string[] = [];
                if (firstRow.tags && firstRow.tags.length > 0) {
                    for (const tagName of firstRow.tags) {
                        const tagInfo = tagMap.get(tagName.toUpperCase());
                        if (tagInfo) parentTagIds.push(tagInfo.id);
                    }
                }

                // Pre-calculate subtask counts for this parent
                const subtaskRowsForThisParent = taskGroup.filter(t => t.subtaskName);
                const subtaskCountVal = subtaskRowsForThisParent.length;
                const completedSubtaskCountVal = subtaskRowsForThisParent.filter(st => st.status === "COMPLETED").length;

                // Create parent task
                const parentTask = await tx.task.create({
                    data: {
                        name: taskName,
                        taskSlug: taskSlug,
                        description: firstRow.description,
                        projectId: data.projectId,
                        workspaceId: project.workspaceId,
                        createdById: creatorProjectMemberId,
                        isParent: true,
                        status: firstRow.status ? (firstRow.status as any) : undefined,
                        assigneeId: parentAssigneeId,
                        reviewerId: parentReviewerId,
                        startDate: parentStartDate,
                        days: firstRow.days,
                        tags: {
                            connect: parentTagIds.map(id => ({ id }))
                        },
                        subtaskCount: subtaskCountVal,
                        completedSubtaskCount: completedSubtaskCountVal,
                        position: parentTaskIndex,
                    },
                });

                // Track created parent task ID
                // (The subtask IDs and parent ID are added to createdItems below via createdTasks)

                const createdTasks: any[] = [];

                // Create subtasks
                const subtaskRows = taskGroup.filter(t => t.subtaskName);

                if (subtaskRows.length > 0) {
                    let subtaskPositionIndex = 0;
                    for (const subtaskRow of subtaskRows) {
                        subtaskPositionIndex++;
                        const subtaskSlug = allSubtaskSlugs[globalSubtaskIndex++];

                        const subtaskAssigneeId = subtaskRow.assigneeEmail
                            ? emailToMemberId.get(subtaskRow.assigneeEmail.trim().toLowerCase())
                            : undefined;

                        const subtaskReviewerId = subtaskRow.reviewerEmail
                            ? emailToMemberId.get(subtaskRow.reviewerEmail.trim().toLowerCase())
                            : creatorProjectMemberId;

                        const subtaskStartDate = subtaskRow.startDate
                            ? parseIST(subtaskRow.startDate) || undefined
                            : undefined;

                        // Resolve tag IDs
                        const resolvedTagIds: string[] = [];
                        let shouldAddToProcurement = false;

                        if (subtaskRow.tags && subtaskRow.tags.length > 0) {
                            for (const tagName of subtaskRow.tags) {
                                const tagInfo = tagMap.get(tagName.toUpperCase());
                                if (tagInfo) {
                                    resolvedTagIds.push(tagInfo.id);
                                    if (tagInfo.requirePurchase === true) {
                                        shouldAddToProcurement = true;
                                    }
                                }
                            }
                        }

                        const createdSubtask = await tx.task.create({
                            data: {
                                name: subtaskRow.subtaskName!,
                                taskSlug: subtaskSlug,
                                description: subtaskRow.description,
                                projectId: data.projectId,
                                workspaceId: project.workspaceId,
                                createdById: creatorProjectMemberId,
                                parentTaskId: parentTask.id,
                                isParent: false,
                                assigneeId: subtaskAssigneeId,
                                reviewerId: subtaskReviewerId,
                                startDate: subtaskStartDate,
                                days: subtaskRow.days,
                                dueDate: calculateDueDate(subtaskStartDate, subtaskRow.days),
                                status: subtaskRow.status ? (subtaskRow.status as any) : undefined,
                                tags: {
                                    connect: resolvedTagIds.map(id => ({ id }))
                                },
                                position: subtaskPositionIndex,
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

                        createdTasks.push(createdSubtask.id);
                    }
                }
                createdTasks.push(parentTask.id);
                createdItems.push(...createdTasks);
            }
        }, {
            timeout: 60000,
        });

        // 6. Fetch all created tasks with relations to return to frontend
        const fullTasks = await prisma.task.findMany({
            where: {
                id: { in: createdItems }
            },
            include: {
                assignee: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: true
                            }
                        }
                    }
                },
                reviewer: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: true
                            }
                        }
                    }
                },
                tags: true,
                _count: {
                    select: { subTasks: true }
                }
            }
        });

        // Revalidate caches globally
        await invalidateTaskMutation({
            projectId: data.projectId,
            workspaceId: project.workspaceId,
            userId: user.id
        });

        const taskCount = fullTasks.filter(i => i.isParent).length;
        const subtaskCount = fullTasks.filter(i => !i.isParent).length;

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
            data: fullTasks,
        };

    } catch (err: any) {
        console.error("Error bulk uploading tasks:", err);

        if (err.code === 'P2002') {
            const field = err.meta?.target?.[0] || 'field';
            return {
                status: "error",
                message: `Duplicate ${field} found. Please ensure all task and subtask names are unique.`,
            };
        }

        if (err.code === 'P2003') {
            return {
                status: "error",
                message: "Invalid assignee email or project member not found. Please check that all assignees are members of the project.",
            };
        }

        if (err.code === 'P2025') {
            return {
                status: "error",
                message: "Project or workspace not found. Please refresh and try again.",
            };
        }

        if (err.message?.includes('22021') || err.message?.includes('invalid byte sequence')) {
            return {
                status: "error",
                message: "Your CSV file contains invalid characters. Please re-save your CSV file in UTF-8 encoding without BOM or try copying the data to a new file.",
            };
        }

        const errorMessage = err.message || "Unknown error occurred";
        return {
            status: "error",
            message: `Failed to upload tasks: ${errorMessage}`,
        };
    }
}
