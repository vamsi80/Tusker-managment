"use server";

import { revalidateTag } from "next/cache";
import { CacheTags } from "@/data/cache-tags";

// ============================================
// WORKSPACE CACHE INVALIDATION
// ============================================

/**
 * Invalidate workspace data cache
 */
export async function invalidateWorkspace(workspaceId: string) {
    CacheTags.workspace(workspaceId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate user workspaces cache
 */
export async function invalidateUserWorkspaces(userId: string) {
    CacheTags.userWorkspaces(userId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate workspace members cache
 */
export async function invalidateWorkspaceMembers(workspaceId: string) {
    CacheTags.workspaceMembers(workspaceId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate admin check cache for a specific user
 */
export async function invalidateAdminCheck(userId: string) {
    CacheTags.adminCheck(userId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate admin check cache for a workspace (all users)
 */
export async function invalidateWorkspaceAdminChecks(workspaceId: string) {
    CacheTags.workspaceAdmin(workspaceId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate workspace tags cache
 */
export async function invalidateWorkspaceTags(workspaceId: string) {
    CacheTags.workspaceTags(workspaceId).forEach(tag => revalidateTag(tag, "layout"));
}

// ============================================
// PROJECT CACHE INVALIDATION
// ============================================

/**
 * Invalidate user projects cache for a specific user
 */
export async function invalidateUserProjects(userId: string, workspaceId: string) {
    CacheTags.userProjects(userId, workspaceId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate all projects cache for a workspace
 */
export async function invalidateWorkspaceProjects(workspaceId: string) {
    revalidateTag(`workspace-projects-${workspaceId}`, "layout");
}

/**
 * Invalidate both user and workspace project caches
 */
export async function invalidateProjectCaches(userId: string, workspaceId: string) {
    await invalidateUserProjects(userId, workspaceId);
    await invalidateWorkspaceProjects(workspaceId);
}

/**
 * Invalidate project data cache
 */
export async function invalidateProject(projectId: string) {
    CacheTags.project(projectId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate project members cache
 * Call this when project members are added, removed, or updated
 */
export async function invalidateProjectMembers(projectId: string) {
    CacheTags.projectMembers(projectId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate full project data cache
 */
export async function invalidateFullProject(projectId: string) {
    CacheTags.fullProject(projectId).forEach(tag => revalidateTag(tag, "layout"));
}

// ============================================
// TASK CACHE INVALIDATION
// ============================================

/**
 * Invalidate project tasks cache for a specific project
 * Call this when tasks are created, updated, or deleted
 */
export async function invalidateProjectTasks(projectId: string, userId?: string) {
    CacheTags.projectTasks(projectId, userId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate all project tasks cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllProjectTasks() {
    revalidateTag('project-tasks-all', "layout");
}

/**
 * Invalidate workspace tasks cache for a specific workspace
 * Call this when tasks are created, updated, or deleted in any project within the workspace
 */
export async function invalidateWorkspaceTasks(workspaceId: string, userId?: string) {
    CacheTags.workspaceTasks(workspaceId, userId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate all workspace tasks cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllWorkspaceTasks() {
    revalidateTag('workspace-tasks-all', "layout");
}

/**
 * Invalidate both project and workspace task caches
 * Call this on any task mutation to ensure both views are updated
 * 
 * @param projectId - The project ID
 * @param workspaceId - The workspace ID
 * @param userId - Optional user ID for user-specific caches
 */
export async function invalidateTaskCaches(projectId: string, workspaceId: string, userId?: string) {
    await invalidateProjectTasks(projectId, userId);
    await invalidateWorkspaceTasks(workspaceId, userId);
}

/**
 * Invalidate specific task cache
 */
export async function invalidateTask(taskId: string) {
    CacheTags.task(taskId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate task details cache
 */
export async function invalidateTaskDetails(taskId: string, projectId: string) {
    CacheTags.taskDetails(taskId, projectId).forEach(tag => revalidateTag(tag, "layout"));
}

// ============================================
// SUBTASK CACHE INVALIDATION
// ============================================

/**
 * Invalidate subtasks cache for a specific parent task
 * Call this when subtasks are created, updated, or deleted
 */
export async function invalidateTaskSubTasks(parentTaskId: string, workspaceMemberId?: string) {
    CacheTags.taskSubTasks(parentTaskId, workspaceMemberId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate all subtasks cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllTaskSubTasks() {
    revalidateTag('task-subtasks-all', "layout");
}

/**
 * Invalidate project subtasks cache
 */
export async function invalidateProjectSubTasks(projectId: string) {
    CacheTags.projectSubTasks(projectId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate specific subtask cache
 */
export async function invalidateSubTask(subTaskId: string) {
    CacheTags.subtask(subTaskId).forEach(tag => revalidateTag(tag, "layout"));
}

// ============================================
// COMMENT CACHE INVALIDATION
// ============================================

/**
 * Invalidate task comments cache for a specific task
 * Call this when comments are created, updated, or deleted
 */
export async function invalidateTaskComments(taskId: string) {
    CacheTags.taskComments(taskId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate all comments cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllComments() {
    revalidateTag('comments-all', "layout");
}

/**
 * Invalidate review comments cache for a specific subtask
 * Call this when review comments are created or updated
 */
export async function invalidateReviewComments(subTaskId: string) {
    CacheTags.reviewComments(subTaskId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Invalidate all review comments cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllReviewComments() {
    revalidateTag('review-comments-all', "layout");
}

// ============================================
// PERMISSION CACHE INVALIDATION
// ============================================

/**
 * Invalidate user permissions cache
 */
export async function invalidateUserPermissions(userId: string, workspaceId: string, projectId?: string) {
    CacheTags.userPermissions(userId, workspaceId, projectId).forEach(tag => revalidateTag(tag, "layout"));
}

// ============================================
// COMBINED CACHE INVALIDATION
// ============================================

/**
 * Invalidate workspace task creation data
 * Call this when any data needed for task creation changes
 */
export async function invalidateWorkspaceTaskCreationData(workspaceId: string, userId: string) {
    CacheTags.workspaceTaskCreationData(workspaceId, userId).forEach(tag => revalidateTag(tag, "layout"));
}

/**
 * Comprehensive invalidation for task mutations
 * Invalidates all related caches when a task is created, updated, or deleted
 */
export async function invalidateTaskMutation(params: {
    taskId?: string;
    projectId: string;
    workspaceId: string;
    userId?: string;
    parentTaskId?: string;
}) {
    const { taskId, projectId, workspaceId, userId, parentTaskId } = params;

    const invalidations: Promise<void>[] = [];

    // Invalidate task-specific caches
    if (taskId) {
        invalidations.push(invalidateTask(taskId));
        invalidations.push(invalidateTaskDetails(taskId, projectId));
    }

    // Invalidate project and workspace caches
    invalidations.push(invalidateTaskCaches(projectId, workspaceId, userId));

    // Invalidate parent task subtasks if applicable
    if (parentTaskId) {
        invalidations.push(invalidateTaskSubTasks(parentTaskId));
    }

    // Invalidate workspace task creation data
    if (userId) {
        invalidations.push(invalidateWorkspaceTaskCreationData(workspaceId, userId));
    }

    await Promise.all(invalidations);
}
