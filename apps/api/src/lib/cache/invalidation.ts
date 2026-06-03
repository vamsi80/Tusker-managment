/**
 * Cache Invalidation system for API.
 * Since the API runs on Cloudflare Workers / Hono without next/cache,
 * these cache invalidation functions are no-ops here.
 * Real-time updates and synchronization are handled via Pusher.
 */

export async function invalidateWorkspace(workspaceId: string) {}
export async function invalidateUserWorkspaces(userId: string) {}
export async function invalidateWorkspaceAttendance(workspaceId: string, userId?: string) {}
export async function invalidateWorkspaceLeaves(workspaceId: string, userId?: string) {}
export async function invalidateWorkspaceMembers(workspaceId: string) {}
export async function invalidateAdminCheck(userId: string) {}
export async function invalidateWorkspaceAdminChecks(workspaceId: string) {}
export async function invalidateWorkspaceTags(workspaceId: string) {}
export async function invalidateUserProjects(userId: string, workspaceId: string) {}
export async function invalidateWorkspaceProjects(workspaceId: string) {}
export async function invalidateProjectCaches(userId: string, workspaceId: string) {}
export async function invalidateProject(projectId: string) {}
export async function invalidateProjectMembers(projectId: string) {}
export async function invalidateFullProject(projectId: string) {}
export async function invalidateProjectTasks(projectId: string, userId?: string) {}
export async function invalidateAllProjectTasks() {}
export async function invalidateWorkspaceTasks(workspaceId: string, userId?: string) {}
export async function invalidateAllWorkspaceTasks() {}
export async function invalidateTaskCaches(projectId: string, workspaceId: string, userId?: string) {}
export async function invalidateTask(taskId: string) {}
export async function invalidateTaskDetails(taskId: string, projectId: string) {}
export async function invalidateTaskSubTasks(parentTaskId: string, workspaceMemberId?: string) {}
export async function invalidateAllTaskSubTasks() {}
export async function invalidateProjectSubTasks(projectId: string) {}
export async function invalidateSubTask(subTaskId: string) {}
export async function invalidateSubTasksByStatus(projectId: string, status: string, parentTaskId?: string) {}
export async function invalidateTaskComments(taskId: string) {}
export async function invalidateAllComments() {}
export async function invalidateActivities(subTaskId: string) {}
export async function invalidateAllActivities() {}
export async function invalidateUserPermissions(userId: string, workspaceId: string, projectId?: string) {}
export async function invalidateWorkspaceTaskCreationData(workspaceId: string, userId: string) {}
export async function invalidateTaskMutation(params: {
    taskId?: string;
    projectId: string;
    workspaceId: string;
    userId?: string;
    parentTaskId?: string;
    involvedUserIds?: string[];
}) {}
