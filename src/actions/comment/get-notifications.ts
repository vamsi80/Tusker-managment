"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
export async function getNotificationsAction(workspaceId: string, limit: number = 25, offset: number = 0) {
    try {
        const user = await requireUser();
        const perms = await getWorkspacePermissions(workspaceId, user.id);

        if (!perms.workspaceMemberId) {
            return { success: false, error: "Access denied" };
        }

        const isAuthorized = perms.isWorkspaceAdmin || perms.workspaceMember;

        if (!isAuthorized) {
            return { success: false, error: "Access denied" };
        }

        const where: any = {
            task: {
                workspaceId: workspaceId
            }
        };

        if (!perms.isWorkspaceAdmin) {
            const privilegedProjectIds = [
                ...(perms.leadProjectIds || []),
                ...(perms.managedProjectIds || [])
            ];

            where.task = {
                ...where.task,
                OR: [
                    { assigneeTo: user.id },
                    { createdById: user.id },
                    { reviewerId: user.id },
                    ...(privilegedProjectIds.length > 0
                        ? [{ projectId: { in: privilegedProjectIds } }]
                        : [])
                ]
            };
        }

        where.userId = {
            not: user.id
        };
        const comments = await prisma.comment.findMany({
            where,
            include: {
                user: {
                    select: {
                        name: true,
                        surname: true
                    }
                },
                readBy: {
                    where: {
                        userId: user.id
                    }
                },
                task: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                        project: {
                            select: {
                                name: true,
                                color: true,
                            }
                        },
                        parentTask: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: limit,
            skip: offset
        });

        // Group comments by task
        const groupedMap = new Map();

        comments.forEach(comment => {
            const isRead = comment.readBy.length > 0;

            if (!groupedMap.has(comment.taskId)) {
                groupedMap.set(comment.taskId, {
                    taskId: comment.taskId,
                    taskName: comment.task.name,
                    taskSlug: comment.task.taskSlug,
                    projectName: comment.task.project.name,
                    parentTaskName: comment.task.parentTask?.name || null,
                    latestComment: comment,
                    count: 0,
                    isNew: false // Assume read, then check if any comment is unread
                });
            }

            const group = groupedMap.get(comment.taskId);
            group.count++;

            // If even one comment is unread, the group is "New"
            if (!isRead) {
                group.isNew = true;
            }
        });

        const allNotifications = Array.from(groupedMap.values());

        // Split into two sections
        const unreadNotifications = allNotifications.filter(n => n.isNew);
        const readNotifications = allNotifications.filter(n => !n.isNew);

        // Count for the badge (only unread)
        const unreadCommenters = await prisma.comment.groupBy({
            by: ['userId'],
            where: {
                ...where,
                readBy: {
                    none: { userId: user.id }
                }
            },
            _count: {
                userId: true
            }
        });

        return {
            success: true,
            unreadNotifications,
            readNotifications,
            peopleCount: unreadCommenters.length,
            totalCount: comments.length,
            hasMore: comments.length === limit
        };

    } catch (error) {
        console.error("Error fetching notifications:", error);
        return { success: false, error: "Failed to fetch notifications" };
    }
}

/**
 * Marks all comments for a specific task as read for the current user.
 */
export async function markTaskCommentsReadAction(taskId: string) {
    try {
        const user = await requireUser();

        // Find all unread comments for this task (not written by the user)
        const unreadComments = await prisma.comment.findMany({
            where: {
                taskId,
                userId: { not: user.id },
                readBy: {
                    none: { userId: user.id }
                }
            },
            select: { id: true }
        });

        if (unreadComments.length === 0) return { success: true };

        // Create read receipts
        await prisma.commentRead.createMany({
            data: unreadComments.map(c => ({
                userId: user.id,
                commentId: c.id
            })),
            skipDuplicates: true
        });

        return { success: true };
    } catch (error) {
        console.error("Error marking comments as read:", error);
        return { success: false, error: "Failed to mark as read" };
    }
}
