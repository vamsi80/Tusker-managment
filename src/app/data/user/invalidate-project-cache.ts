"use server";

import { revalidateTag } from "next/cache";

/**
 * Invalidate user projects cache for a specific user
 */
export async function invalidateUserProjects(userId: string) {
    revalidateTag(`user-projects-${userId}`);
}

/**
 * Invalidate all projects cache for a workspace
 */
export async function invalidateWorkspaceProjects(workspaceId: string) {
    revalidateTag(`workspace-projects-${workspaceId}`);
}

/**
 * Invalidate both user and workspace project caches
 */
export async function invalidateProjectCaches(userId: string, workspaceId: string) {
    await invalidateUserProjects(userId);
    await invalidateWorkspaceProjects(workspaceId);
}

/**
 * Invalidate user workspaces cache
 */
export async function invalidateUserWorkspaces(userId: string) {
    revalidateTag(`user-workspaces-${userId}`);
}

/**
 * Invalidate admin check cache for a specific user
 */
export async function invalidateAdminCheck(userId: string) {
    revalidateTag(`admin-check-${userId}`);
}

/**
 * Invalidate admin check cache for a workspace (all users)
 */
export async function invalidateWorkspaceAdminChecks(workspaceId: string) {
    revalidateTag(`workspace-admin-${workspaceId}`);
}

