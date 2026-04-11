// @ts-nocheck
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
    const tags = CacheTags.workspace(workspaceId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate user workspaces cache
 */
export async function invalidateUserWorkspaces(userId: string) {
    const tags = CacheTags.userWorkspaces(userId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate workspace members cache
 */
export async function invalidateWorkspaceMembers(workspaceId: string) {
    const tags = [
        ...CacheTags.workspaceMembers(workspaceId),
        ...CacheTags.workspace(workspaceId), // Ensure full workspace data is also updated
    ];
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate admin check cache for a specific user
 */
export async function invalidateAdminCheck(userId: string) {
    const tags = CacheTags.adminCheck(userId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate admin check cache for a workspace (all users)
 */
export async function invalidateWorkspaceAdminChecks(workspaceId: string) {
    const tags = CacheTags.workspaceAdmin(workspaceId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate workspace tags cache
 */
export async function invalidateWorkspaceTags(workspaceId: string) {
    const tags = CacheTags.workspaceTags(workspaceId);
    tags.forEach(tag => revalidateTag(tag));
}

// ============================================
// PROJECT CACHE INVALIDATION
// ============================================

/**
 * Invalidate user projects cache for a specific user
 */
export async function invalidateUserProjects(userId: string, workspaceId: string) {
    const tags = CacheTags.userProjects(userId, workspaceId);
    tags.forEach(tag => revalidateTag(tag));
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
    await invalidateUserProjects(userId, workspaceId);
    await invalidateWorkspaceProjects(workspaceId);
}

/**
 * Invalidate project data cache
 */
export async function invalidateProject(projectId: string) {
    const tags = CacheTags.project(projectId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate project members cache
 * Call this when project members are added, removed, or updated
 */
export async function invalidateProjectMembers(projectId: string) {
    const tags = [
        ...CacheTags.projectMembers(projectId),
        ...CacheTags.fullProject(projectId),
        ...CacheTags.project(projectId)
    ];
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate full project data cache
 */
export async function invalidateFullProject(projectId: string) {
    const tags = CacheTags.fullProject(projectId);
    tags.forEach(tag => revalidateTag(tag));
}

// ============================================
// TASK CACHE INVALIDATION
// ============================================

/**
 * Invalidate project tasks cache for a specific project
 * Call this when tasks are created, updated, or deleted
 */
export async function invalidateProjectTasks(projectId: string, userId?: string) {
    const tags = CacheTags.projectTasks(projectId, userId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate all project tasks cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllProjectTasks() {
    revalidateTag('project-tasks-all');
}

/**
 * Invalidate workspace tasks cache for a specific workspace
 * Call this when tasks are created, updated, or deleted in any project within the workspace
 */
export async function invalidateWorkspaceTasks(workspaceId: string, userId?: string) {
    const tags = CacheTags.workspaceTasks(workspaceId, userId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate all workspace tasks cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllWorkspaceTasks() {
    revalidateTag('workspace-tasks-all');
}

/**
 * Invalidate both project and workspace task caches
 * Call this on any task mutation to ensure both views are updated
 */
export async function invalidateTaskCaches(projectId: string, workspaceId: string, userId?: string) {
    await invalidateProjectTasks(projectId, userId);
    await invalidateWorkspaceTasks(workspaceId, userId);
}

/**
 * Invalidate specific task cache
 */
export async function invalidateTask(taskId: string) {
    const tags = CacheTags.task(taskId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate task details cache
 */
export async function invalidateTaskDetails(taskId: string, projectId: string) {
    const tags = CacheTags.taskDetails(taskId, projectId);
    tags.forEach(tag => revalidateTag(tag));
}

// ============================================
// SUBTASK CACHE INVALIDATION
// ============================================

/**
 * Invalidate subtasks cache for a specific parent task
 * Call this when subtasks are created, updated, or deleted
 */
export async function invalidateTaskSubTasks(parentTaskId: string, workspaceMemberId?: string) {
    const tags = CacheTags.taskSubTasks(parentTaskId, workspaceMemberId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate all subtasks cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllTaskSubTasks() {
    revalidateTag('task-subtasks-all');
}

/**
 * Invalidate project subtasks cache
 */
export async function invalidateProjectSubTasks(projectId: string) {
    const tags = CacheTags.projectSubTasks(projectId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate specific subtask cache
 */
export async function invalidateSubTask(subTaskId: string) {
    const tags = CacheTags.subtask(subTaskId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate subtasks by status for a project
 */
export async function invalidateSubTasksByStatus(projectId: string, status: string, parentTaskId?: string) {
    const tags = CacheTags.subtasksByStatus(projectId, status, parentTaskId);
    tags.forEach(tag => revalidateTag(tag));
}

// ============================================
// COMMENT CACHE INVALIDATION
// ============================================

/**
 * Invalidate task comments cache for a specific task
 * Call this when comments are created, updated, or deleted
 */
export async function invalidateTaskComments(taskId: string) {
    const tags = CacheTags.taskComments(taskId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate all comments cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllComments() {
    revalidateTag('comments-all');
}

/**
 * Invalidate review comments cache for a specific subtask
 * Call this when review comments are created or updated
 */
export async function invalidateReviewComments(subTaskId: string) {
    const tags = CacheTags.reviewComments(subTaskId);
    tags.forEach(tag => revalidateTag(tag));
}

/**
 * Invalidate all review comments cache
 * Use sparingly - only when needed for global changes
 */
export async function invalidateAllReviewComments() {
    revalidateTag('review-comments-all');
}

// ============================================
// PERMISSION CACHE INVALIDATION
// ============================================

/**
 * Invalidate user permissions cache
 */
export async function invalidateUserPermissions(userId: string, workspaceId: string, projectId?: string) {
    const tags = CacheTags.userPermissions(userId, workspaceId, projectId);
    tags.forEach(tag => revalidateTag(tag));
}

// ============================================
// COMBINED CACHE INVALIDATION
// ============================================

/**
 * Invalidate workspace task creation data
 * Call this when any data needed for task creation changes
 */
export async function invalidateWorkspaceTaskCreationData(workspaceId: string, userId: string) {
    const tags = CacheTags.workspaceTaskCreationData(workspaceId, userId);
    tags.forEach(tag => revalidateTag(tag));
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

    // Invalidate workspace tags (since task counts might have changed)
    invalidations.push(invalidateWorkspaceTags(workspaceId));

    await Promise.all(invalidations);
}
