"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { CacheTags } from "@/data/cache-tags";

// 🚀 Emergency Performance Cache (Bypasses even next-cache overhead for 30s)
const PERMISSION_MEMORY_CACHE = new Map<string, { data: any, timestamp: number }>();
const MEMORY_TTL = 30000; // 30 seconds

function getMemoryCached<T>(key: string): T | null {
    const cached = PERMISSION_MEMORY_CACHE.get(key);
    if (cached && Date.now() - cached.timestamp < MEMORY_TTL) {
        return cached.data;
    }
    return null;
}

function setMemoryCached(key: string, data: any) {
    PERMISSION_MEMORY_CACHE.set(key, { data, timestamp: Date.now() });
    // Cleanup old items periodically (simple)
    if (PERMISSION_MEMORY_CACHE.size > 500) PERMISSION_MEMORY_CACHE.clear();
}

/**
 * Get workspace-level permissions for the current user
 * Use this for workspace-level queries (no specific project)
 */
/**
 * Internal function to fetch workspace permissions
 */
async function _fetchWorkspacePermissionsInternal(workspaceId: string, userId: string) {
    try {
        const workspaceMember = await prisma.workspaceMember.findFirst({
            where: {
                workspaceId: workspaceId,
                userId: userId,
            },
            include: {
                projectMembers: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                workspaceId: true
                            }
                        }
                    }
                }
            }
        });

        if (!workspaceMember) {
            return {
                isWorkspaceAdmin: false,
                canCreateProject: false,
                isProjectLead: false,
                hasAccess: false,
                workspaceMemberId: null,
                workspaceMember: null,
                leadProjectIds: [],
                managedProjectIds: [],
                memberProjectIds: []
            };
        }

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
        const canCreateProject = isWorkspaceAdmin || workspaceMember.workspaceRole === "MANAGER";

        const projectRoles = workspaceMember.projectMembers || [];
        const leadProjectIds = projectRoles.filter(p => p.projectRole === "LEAD").map(p => p.projectId);
        const managedProjectIds = projectRoles.filter(p => p.projectRole === "PROJECT_MANAGER").map(p => p.projectId);
        const memberProjectIds = projectRoles.filter(p => p.projectRole === "MEMBER").map(p => p.projectId);

        const isProjectLead = leadProjectIds.length > 0;
        const isProjectManager = managedProjectIds.length > 0;
        const hasAccess = isWorkspaceAdmin || isProjectLead || isProjectManager || memberProjectIds.length > 0;

        return {
            isWorkspaceAdmin,
            canCreateProject,
            isProjectLead,
            isProjectManager,
            hasAccess,
            leadProjectIds,
            managedProjectIds,
            memberProjectIds,
            workspaceMemberId: workspaceMember.id,
            workspaceMember,
        };
    } catch (error) {
        console.error("Error fetching workspace permissions:", error);
        return {
            isWorkspaceAdmin: false,
            canCreateProject: false,
            isProjectLead: false,
            hasAccess: false,
            leadProjectIds: [],
            workspaceMemberId: null,
            workspaceMember: null,
        };
    }
}

/**
 * Get workspace-level permissions for the current user
 */
export const getWorkspacePermissions = cache(async (workspaceId: string, providedUserId?: string) => {
    // If userId is provided (e.g. from a Server Action), bypass requireUser to save ~1s
    const userId = providedUserId || (await requireUser()).id;
    const cacheKey = `ws-perms-${workspaceId}-${userId}`;

    // 1. FAST PATH: Memory Cache (0.1ms)
    const memoryCached = getMemoryCached<any>(cacheKey);
    if (memoryCached) return memoryCached;

    // 2. SLOW PATH: Next.js Cache / Database
    const fetchPerms = unstable_cache(
        async () => _fetchWorkspacePermissionsInternal(workspaceId, userId),
        [`workspace-perms-${workspaceId}-${userId}`],
        {
            tags: CacheTags.userPermissions(userId, workspaceId),
            revalidate: 300, // 5 minutes
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
        const workspaceMember = await prisma.workspaceMember.findFirst({
            where: { workspaceId, userId },
            include: {
                projectMembers: {
                    where: { projectId },
                    take: 1
                }
            }
        });

        if (!workspaceMember) {
            return {
                isWorkspaceAdmin: false,
                isProjectLead: false,
                isMember: false,
                canCreateSubTask: false,
                canPerformBulkOperations: false,
                workspaceMemberId: null,
            };
        }

        const projectMember = workspaceMember.projectMembers[0];

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
        const isProjectManager = projectMember?.projectRole === "PROJECT_MANAGER";
        const isProjectLead = projectMember?.projectRole === "LEAD";
        const isMember = !isWorkspaceAdmin && !isProjectManager && !isProjectLead;
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
            workspaceMember,
            projectMember,
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

    // 2. SLOW PATH: Next.js Cache / Database
    const fetchPerms = unstable_cache(
        async () => _getUserPermissionsInternal(workspaceId, projectId, userId),
        [`project-perms-${projectId}-${userId}`],
        {
            tags: CacheTags.userPermissions(userId, workspaceId),
            revalidate: 300, // 5 minutes
        }
    );

    const result = await fetchPerms();
    setMemoryCached(cacheKey, result);
    return result;
});

export type WorkspacePermissionsType = Awaited<ReturnType<typeof getWorkspacePermissions>>;
export type UserPermissionsType = Awaited<ReturnType<typeof getUserPermissions>>;
