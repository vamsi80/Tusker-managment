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

/**
 * Invalidate workspace members cache
 */
export async function invalidateWorkspaceMembers(workspaceId: string) {
    revalidateTag(`workspace-members-${workspaceId}`);
}

// ============================================
// TASK CACHE INVALIDATION
// ============================================

/**
 * Invalidate project tasks cache for a specific project
 * Call this when tasks are created, updated, or deleted
 */
export async function invalidateProjectTasks(projectId: string) {
    revalidateTag(`project-tasks-${projectId}`);
}

/**
 * Invalidate all project tasks cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllProjectTasks() {
    revalidateTag(`project-tasks-all`);
}

/**
 * Invalidate subtasks cache for a specific parent task
 * Call this when subtasks are created, updated, or deleted
 */
export async function invalidateTaskSubTasks(parentTaskId: string) {
    revalidateTag(`task-subtasks-${parentTaskId}`);
}

/**
 * Invalidate all subtasks cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllTaskSubTasks() {
    revalidateTag(`task-subtasks-all`);
}

/**
 * Invalidate project members cache
 * Call this when project members are added, removed, or updated
 */
export async function invalidateProjectMembers(projectId: string) {
    revalidateTag(`project-members-${projectId}`);
}
