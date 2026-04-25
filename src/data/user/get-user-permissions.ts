"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags } from "@/data/cache-tags";

const PERMISSION_MEMORY_CACHE = new Map<string, { data: any, timestamp: number }>();
const MEMORY_TTL = 15000; // 15 seconds

function getMemoryCached<T>(key: string): T | null {
    const cached = PERMISSION_MEMORY_CACHE.get(key);
    if (cached && Date.now() - cached.timestamp < MEMORY_TTL) {
        return cached.data;
    }
    return null;
}

function setMemoryCached(key: string, data: any) {
    PERMISSION_MEMORY_CACHE.set(key, { data, timestamp: Date.now() });
    if (PERMISSION_MEMORY_CACHE.size > 500) PERMISSION_MEMORY_CACHE.clear();
}

/**
 * Get workspace-level permissions for the current user
 * Use this for workspace-level queries (no specific project)
 */
/**
 * Internal function to fetch workspace permissions
 */
async function _fetchWorkspacePermissionsInternal(workspaceId: string, userId: string, lean: boolean = false) {
    try {
        const workspaceMember = await prisma.workspaceMember.findFirst({
            where: { workspaceId: workspaceId, userId: userId },
            include: {
                user: {
                    select: {
                        id: true,
                        surname: true,
                    }
                }
            }
        });

        if (!workspaceMember) {
            return {
                isWorkspaceAdmin: false,
                canCreateProject: false,
                isProjectLead: false,
                isProjectManager: false,
                hasAccess: false,
                workspaceMemberId: null,
                workspaceRole: null,
                userId: null,
                ...(lean ? {} : {
                    leadProjectIds: [],
                    managedProjectIds: [],
                    memberProjectIds: [],
                    viewerProjectIds: []
                })
            } as any;
        }

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
        const canCreateProject = isWorkspaceAdmin || workspaceMember.workspaceRole === "MANAGER";

        let leadProjectIds: string[] = [];
        let managedProjectIds: string[] = [];
        let memberProjectIds: string[] = [];
        let viewerProjectIds: string[] = [];

        if (isWorkspaceAdmin) {
            // 🚀 Admin Override: Grant access to ALL projects in the workspace
            const allProjects = await prisma.project.findMany({
                where: { workspaceId },
                select: { id: true }
            });
            const allIds = allProjects.map(p => p.id);
            leadProjectIds = allIds;
            managedProjectIds = allIds;
            memberProjectIds = allIds;
        } else {
            // Standard User: Fetch explicit roles
            const projectRoles = await prisma.projectMember.findMany({
                where: {
                    workspaceMember: {
                        userId: userId,
                        workspaceId: workspaceId,
                    },
                },
                select: {
                    projectId: true,
                    projectRole: true,
                },
            });

            leadProjectIds = projectRoles.filter(p => p.projectRole === "LEAD").map(p => p.projectId);
            managedProjectIds = projectRoles.filter(p => p.projectRole === "PROJECT_MANAGER").map(p => p.projectId);
            memberProjectIds = projectRoles.filter(p => p.projectRole === "MEMBER").map(p => p.projectId);
            viewerProjectIds = projectRoles.filter(p => p.projectRole === "VIEWER").map(p => p.projectId);
        }

        const isProjectLead = isWorkspaceAdmin || leadProjectIds.length > 0;
        const isProjectManager = isWorkspaceAdmin || managedProjectIds.length > 0;
        const hasAccess = isWorkspaceAdmin || isProjectManager || isProjectLead || memberProjectIds.length > 0 || viewerProjectIds.length > 0;

        return {
            isWorkspaceAdmin,
            canCreateProject,
            isProjectLead,
            isProjectManager,
            hasAccess,
            workspaceMemberId: workspaceMember.id,
            workspaceRole: workspaceMember.workspaceRole,
            userId: workspaceMember.userId,
            userSurname: workspaceMember.user?.surname || null,
            ...(lean ? {} : {
                leadProjectIds,
                managedProjectIds,
                memberProjectIds,
                viewerProjectIds,
            })
        } as any;
    } catch (error) {
        console.error("Error fetching workspace permissions:", error);
        return {
            isWorkspaceAdmin: false,
            canCreateProject: false,
            isProjectLead: false,
            isProjectManager: false,
            hasAccess: false,
            workspaceMemberId: null,
            workspaceRole: null,
            userId: null,
            userSurname: null,
            leadProjectIds: [],
            managedProjectIds: [],
        };
    }
}

/**
 * Get workspace-level permissions for the current user
 */
export const getWorkspacePermissions = cache(async (workspaceId: string, providedUserId?: string, lean: boolean = false) => {
    // If userId is provided (e.g. from a Server Action), bypass requireUser to save ~1s
    const userId = providedUserId || (await requireUser()).id;
    const cacheKey = `ws-perms-${workspaceId}-${userId}`;

    // 1. FAST PATH: Memory Cache (0.1ms)
    const memoryCached = getMemoryCached<any>(cacheKey);
    if (memoryCached) return memoryCached;

    // 2. SERVER ACTION BYPASS: If providedUserId explicitly passed, skip Next.js disk cache overhead (~1s latency)
    if (providedUserId) {
        const directResult = await _fetchWorkspacePermissionsInternal(workspaceId, userId, lean);
        setMemoryCached(cacheKey, directResult);
        return directResult;
    }

    // 3. SLOW PATH: Next.js Cache / Database (for pages/layouts)
    const fetchPerms = unstable_cache(
        async () => _fetchWorkspacePermissionsInternal(workspaceId, userId, lean),
        [`workspace-perms-${workspaceId}-${userId}${lean ? '-lean' : ''}`],
        {
            tags: CacheTags.userPermissions(userId, workspaceId),
            revalidate: 60, // 1 minute
        }
    );

    const result = await fetchPerms();
    setMemoryCached(cacheKey, result);
    return result;
});

/**
 * Get project-level permissions for the current user
 * Use this for project-specific queries
 */
/**
 * Internal function to fetch project permissions
 */
async function _getUserPermissionsInternal(workspaceId: string, projectId: string, userId: string) {
    try {
        const [workspaceMember, projectMember] = await Promise.all([
            prisma.workspaceMember.findFirst({
                where: { workspaceId, userId },
                include: {
                    user: {
                        select: {
                            id: true,
                            surname: true,
                        }
                    }
                }
            }),
            prisma.projectMember.findFirst({
                where: {
                    projectId,
                    workspaceMember: { userId },
                },
            }),
        ]);

        if (!workspaceMember) {
            return {
                isWorkspaceAdmin: false,
                isProjectManager: false,
                isProjectLead: false,
                isMember: false,
                canCreateSubTask: false,
                canPerformBulkOperations: false,
                workspaceMemberId: null,
                workspaceRole: null,
                userId: null,
            };
        }

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";

        // Logical overrides for Admins
        const isProjectManager = isWorkspaceAdmin || projectMember?.projectRole === "PROJECT_MANAGER";
        const isProjectLead = isWorkspaceAdmin || projectMember?.projectRole === "LEAD";
        const isMember = !isWorkspaceAdmin && !isProjectManager && !isProjectLead && !!projectMember;

        const canCreateSubTask = isWorkspaceAdmin || isProjectManager || isProjectLead;
        const canPerformBulkOperations = isWorkspaceAdmin || isProjectManager || isProjectLead;

        return {
            isWorkspaceAdmin,
            isProjectManager,
            isProjectLead,
            isMember,
            canCreateSubTask,
            canPerformBulkOperations,
            workspaceMemberId: workspaceMember.id,
            workspaceRole: workspaceMember.workspaceRole,
            userId: workspaceMember.userId,
            userSurname: workspaceMember.user?.surname || null,
            projectMember: projectMember ? {
                id: projectMember.id,
                projectRole: projectMember.projectRole,
            } : null,
        };
    } catch (error) {
        console.error("Error fetching user permissions:", error);
        return {
            isWorkspaceAdmin: false,
            isProjectManager: false,
            isProjectLead: false,
            isMember: false,
            canCreateSubTask: false,
            canPerformBulkOperations: false,
            workspaceMemberId: null,
            workspaceRole: null,
            userId: null,
        };
    }
}

/**
 * Get project-level permissions for the current user
 */
export const getUserPermissions = cache(async (workspaceId: string, projectId: string, providedUserId?: string) => {
    // If userId is provided (e.g. from a Server Action), bypass requireUser to save ~1s
    const userId = providedUserId || (await requireUser()).id;
    const cacheKey = `proj-perms-${projectId}-${userId}`;

    // 1. FAST PATH: Memory Cache (0.1ms)
    const memoryCached = getMemoryCached<any>(cacheKey);
    if (memoryCached) return memoryCached;

    // 2. SERVER ACTION BYPASS: If providedUserId explicitly passed, bypass Next.js disk cache overhead (~1s latency)
    if (providedUserId) {
        const directResult = await _getUserPermissionsInternal(workspaceId, projectId, userId);
        setMemoryCached(cacheKey, directResult);
        return directResult;
    }

    // 3. SLOW PATH: Next.js Cache / Database (for pages/layouts)
    const fetchPerms = unstable_cache(
        async () => _getUserPermissionsInternal(workspaceId, projectId, userId),
        [`project-perms-${projectId}-${userId}`],
        {
            tags: CacheTags.userPermissions(userId, workspaceId),
            revalidate: 60, // 1 minute
        }
    );

    const result = await fetchPerms();
    setMemoryCached(cacheKey, result);
    return result;
});

export type WorkspacePermissionsType = Awaited<ReturnType<typeof getWorkspacePermissions>>;
export type UserPermissionsType = Awaited<ReturnType<typeof getUserPermissions>>;
