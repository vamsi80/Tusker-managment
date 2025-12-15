import "server-only";

import { ProjectRole, WorkspaceRole } from "@/generated/prisma";
import { isWorkspaceAdmin } from "./workspace-access";

/**
 * Project Access Control System
 * 
 * Role Hierarchy (highest to lowest):
 * 1. LEAD - Project admin, can manage project and members
 * 2. MEMBER - Can create and manage tasks
 * 3. VIEWER - Read-only access
 * 
 * Note: Workspace OWNER and ADMIN automatically have admin-level access to all projects
 */

export type ProjectPermission =
    | "project:update"
    | "project:delete"
    | "project:manage-members"
    | "project:add-members"
    | "project:remove-members"
    | "project:update-member-roles"
    | "task:create"
    | "task:update-any"
    | "task:delete-any"
    | "task:assign"
    | "task:view-all"
    | "comment:create"
    | "comment:update-any"
    | "comment:delete-any";

/**
 * Check if a user has a specific project permission
 * Workspace OWNER and ADMIN override project roles
 */
export function hasProjectPermission(
    projectRole: ProjectRole | null,
    workspaceRole: WorkspaceRole,
    permission: ProjectPermission
): boolean {
    // Workspace OWNER and ADMIN have all project permissions
    if (isWorkspaceAdmin(workspaceRole)) {
        return true;
    }

    // If no project role, no permissions
    if (!projectRole) {
        return false;
    }

    const permissions = getProjectPermissions(projectRole);
    return permissions.includes(permission);
}

/**
 * Get all permissions for a project role
 */
export function getProjectPermissions(role: ProjectRole): ProjectPermission[] {
    switch (role) {
        case "LEAD":
            return [
                // Project management
                "project:update",
                "project:manage-members",
                "project:add-members",
                "project:remove-members",
                "project:update-member-roles",
                // Task management
                "task:create",
                "task:update-any",
                "task:delete-any",
                "task:assign",
                "task:view-all",
                // Comments
                "comment:create",
                "comment:update-any",
                "comment:delete-any",
            ];

        case "MEMBER":
            return [
                // Task management (limited)
                "task:create",
                "task:view-all",
                // Comments
                "comment:create",
            ];

        case "VIEWER":
            return [
                // Read-only
                "task:view-all",
            ];

        default:
            return [];
    }
}

/**
 * Check if a user is a project admin
 * Returns true if:
 * - User is workspace OWNER or ADMIN (automatic admin access)
 * - User is project LEAD
 */
export function isProjectAdmin(
    projectRole: ProjectRole | null,
    workspaceRole: WorkspaceRole
): boolean {
    // Workspace OWNER and ADMIN are always project admins
    if (isWorkspaceAdmin(workspaceRole)) {
        return true;
    }

    // Project LEAD is project admin
    return projectRole === "LEAD";
}

/**
 * Check if a user can manage another project member
 * Workspace OWNER/ADMIN can manage anyone
 * Project LEAD can manage MEMBER and VIEWER
 */
export function canManageProjectMember(
    managerProjectRole: ProjectRole | null,
    managerWorkspaceRole: WorkspaceRole,
    targetProjectRole: ProjectRole,
    targetWorkspaceRole: WorkspaceRole
): boolean {
    // Workspace OWNER and ADMIN can manage anyone except other workspace admins
    if (isWorkspaceAdmin(managerWorkspaceRole)) {
        // Cannot manage workspace OWNER or ADMIN through project interface
        return !isWorkspaceAdmin(targetWorkspaceRole);
    }

    // Project LEAD can manage MEMBER and VIEWER
    if (managerProjectRole === "LEAD") {
        return targetProjectRole === "MEMBER" || targetProjectRole === "VIEWER";
    }

    return false;
}

/**
 * Check if a user can assign a project role
 * Workspace OWNER/ADMIN can assign any project role
 * Project LEAD can assign MEMBER and VIEWER
 */
export function canAssignProjectRole(
    assignerProjectRole: ProjectRole | null,
    assignerWorkspaceRole: WorkspaceRole,
    roleToAssign: ProjectRole
): boolean {
    // Workspace OWNER and ADMIN can assign any project role
    if (isWorkspaceAdmin(assignerWorkspaceRole)) {
        return true;
    }

    // Project LEAD can assign MEMBER and VIEWER
    if (assignerProjectRole === "LEAD") {
        return roleToAssign === "MEMBER" || roleToAssign === "VIEWER";
    }

    return false;
}

/**
 * Check if a user can remove a project member
 * Workspace OWNER/ADMIN can remove anyone (except workspace admins)
 * Project LEAD can remove MEMBER and VIEWER
 */
export function canRemoveProjectMember(
    removerProjectRole: ProjectRole | null,
    removerWorkspaceRole: WorkspaceRole,
    targetProjectRole: ProjectRole,
    targetWorkspaceRole: WorkspaceRole
): boolean {
    // Cannot remove workspace OWNER or ADMIN from projects
    // (they have automatic access anyway)
    if (isWorkspaceAdmin(targetWorkspaceRole)) {
        return false;
    }

    // Workspace OWNER and ADMIN can remove anyone
    if (isWorkspaceAdmin(removerWorkspaceRole)) {
        return true;
    }

    // Project LEAD can remove MEMBER and VIEWER
    if (removerProjectRole === "LEAD") {
        return targetProjectRole === "MEMBER" || targetProjectRole === "VIEWER";
    }

    return false;
}

/**
 * Get project role hierarchy level (higher number = more permissions)
 */
export function getProjectRoleLevel(role: ProjectRole): number {
    switch (role) {
        case "LEAD":
            return 3;
        case "MEMBER":
            return 2;
        case "VIEWER":
            return 1;
        default:
            return 0;
    }
}

/**
 * Get effective project role considering workspace role override
 * Workspace OWNER/ADMIN are treated as project LEAD
 */
export function getEffectiveProjectRole(
    projectRole: ProjectRole | null,
    workspaceRole: WorkspaceRole
): ProjectRole {
    // Workspace OWNER and ADMIN are treated as project LEAD
    if (isWorkspaceAdmin(workspaceRole)) {
        return "LEAD";
    }

    return projectRole || "VIEWER";
}

/**
 * Check if a user can update a specific task
 * - Workspace OWNER/ADMIN can update any task
 * - Project LEAD can update any task
 * - MEMBER can update tasks they created or are assigned to
 * - VIEWER cannot update tasks
 */
export function canUpdateTask(
    projectRole: ProjectRole | null,
    workspaceRole: WorkspaceRole,
    isTaskCreator: boolean,
    isTaskAssignee: boolean
): boolean {
    // Workspace OWNER/ADMIN and Project LEAD can update any task
    if (isProjectAdmin(projectRole, workspaceRole)) {
        return true;
    }

    // MEMBER can update their own tasks or assigned tasks
    if (projectRole === "MEMBER") {
        return isTaskCreator || isTaskAssignee;
    }

    return false;
}

/**
 * Check if a user can delete a specific task
 * - Workspace OWNER/ADMIN can delete any task
 * - Project LEAD can delete any task
 * - MEMBER can delete tasks they created
 * - VIEWER cannot delete tasks
 */
export function canDeleteTask(
    projectRole: ProjectRole | null,
    workspaceRole: WorkspaceRole,
    isTaskCreator: boolean
): boolean {
    // Workspace OWNER/ADMIN and Project LEAD can delete any task
    if (isProjectAdmin(projectRole, workspaceRole)) {
        return true;
    }

    // MEMBER can delete their own tasks
    if (projectRole === "MEMBER") {
        return isTaskCreator;
    }

    return false;
}

/**
 * Get display name for a project role
 */
export function getProjectRoleDisplayName(role: ProjectRole): string {
    switch (role) {
        case "LEAD":
            return "Lead";
        case "MEMBER":
            return "Member";
        case "VIEWER":
            return "Viewer";
        default:
            return "Unknown";
    }
}

/**
 * Get project role description
 */
export function getProjectRoleDescription(role: ProjectRole): string {
    switch (role) {
        case "LEAD":
            return "Can manage project, members, and all tasks";
        case "MEMBER":
            return "Can create and manage tasks";
        case "VIEWER":
            return "Read-only access to project";
        default:
            return "";
    }
}
