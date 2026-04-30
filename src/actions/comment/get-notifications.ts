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

        const isAuthorized = perms.isWorkspaceAdmin || !!perms.workspaceMemberId;

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
                    { assignee: { workspaceMember: { userId: user.id } } },
                    { createdBy: { workspaceMember: { userId: user.id } } },
                    { reviewer: { workspaceMember: { userId: user.id } } },
                    ...(privilegedProjectIds.length > 0
                        ? [{ projectId: { in: privilegedProjectIds } }]
                        : [])
                ]
            };
        }

        // Add user filter - don't notify them about their own comments
        where.userId = {
            not: user.id
        };
        const commentInclude = {
            user: {
                select: {
                    name: true,
                    surname: true,
                    image: true,
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
        };

        // 1a. Fetch Unread comments first (High priority - ensures visibility)
        const unreadComments = await prisma.comment.findMany({
            where: {
                ...where,
                readBy: {
                    none: { userId: user.id }
                }
            },
            include: commentInclude,
            orderBy: {
                createdAt: 'desc'
            },
            take: 50 // Get all reasonable unread comments
        });

        // 1b. Fetch general recent comments for history/balance
        const recentComments = await prisma.comment.findMany({
            where,
            include: commentInclude,
            orderBy: {
                createdAt: 'desc'
            },
            take: limit,
            skip: offset
        });

        // Combine and deduplicate by comment ID
        const commentMap = new Map();
        [...unreadComments, ...recentComments].forEach(c => commentMap.set(c.id, c));
        const comments = Array.from(commentMap.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // 2. Fetch activities
        // Ensure activities also respect the same task-level permissions
        const activities = await prisma.activity.findMany({
            where: {
                workspaceId: workspaceId,
                authorId: { not: user.id },
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
                subTask: perms.isWorkspaceAdmin ? {} : where.task // Reuse the same task visibility logic
            },
            include: {
                author: {
                    select: {
                        name: true,
                        surname: true,
                        image: true,
                    }
                },
                subTask: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                        project: {
                            select: {
                                name: true,
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
            take: 10
        });

        // Group items by task
        const groupedMap = new Map();

        // Process combined comments
        comments.forEach(comment => {
            const isRead = comment.readBy.length > 0;

            if (!groupedMap.has(comment.taskId)) {
                groupedMap.set(comment.taskId, {
                    taskId: comment.taskId,
                    taskName: comment.task.name,
                    taskSlug: comment.task.taskSlug,
                    projectName: comment.task.project.name,
                    parentTaskName: comment.task.parentTask?.name || null,
                    latestComment: {
                        content: comment.content,
                        createdAt: comment.createdAt,
                        user: {
                            name: comment.user.name,
                            surname: comment.user.surname,
                            image: (comment.user as any).image
                        }
                    },
                    count: 0,
                    isNew: false
                });
            }

            const group = groupedMap.get(comment.taskId);
            group.count++;
            if (!isRead) group.isNew = true;
        });

        // Process activities (Merge into existing groups or create new)
        activities.forEach(rc => {
            if (!groupedMap.has(rc.subTaskId)) {
                groupedMap.set(rc.subTaskId, {
                    taskId: rc.subTaskId,
                    taskName: rc.subTask.name,
                    taskSlug: rc.subTask.taskSlug,
                    projectName: rc.subTask.project.name,
                    parentTaskName: rc.subTask.parentTask?.name || null,
                    latestComment: {
                        content: rc.text,
                        createdAt: rc.createdAt,
                        user: {
                            name: rc.author.name,
                            surname: rc.author.surname,
                            image: (rc.author as any).image
                        }
                    },
                    count: 0,
                    isNew: true // Recent activities are treated as new
                });
            }

            const group = groupedMap.get(rc.subTaskId);
            group.count++;
            group.isNew = true; // Any recent activity on a visible task makes it "New"
            
            // If this activity is newer than what we have, update latest
            if (new Date(rc.createdAt) > new Date(group.latestComment.createdAt)) {
                group.latestComment = {
                    content: rc.text,
                    createdAt: rc.createdAt,
                    user: {
                        name: rc.author.name,
                        surname: rc.author.surname,
                        image: (rc.author as any).image
                    }
                };
            }
        });

        const allNotifications = Array.from(groupedMap.values())
            .sort((a, b) => new Date(b.latestComment.createdAt).getTime() - new Date(a.latestComment.createdAt).getTime());

        // Split into two sections
        const unreadNotifications = allNotifications.filter(n => n.isNew);
        const readNotifications = allNotifications.filter(n => !n.isNew);

        const peopleCount = unreadNotifications.length;

        return {
            success: true,
            unreadNotifications,
            readNotifications,
            peopleCount,
            totalCount: allNotifications.length,
            hasMore: recentComments.length === limit
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
