import type { WorkspaceRole } from "./workspace-access";
import { isWorkspaceAdmin } from "./workspace-access";

export type ProjectRole = "PROJECT_MANAGER" | "PROJECT_COORDINATOR" | "LEAD" | "MEMBER" | "VIEWER";

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

export function hasProjectPermission(
    projectRole: ProjectRole | null,
    permission: ProjectPermission
): boolean {
    if (!projectRole) {
        return false;
    }

    const permissions = getProjectPermissions(projectRole);
    return permissions.includes(permission);
}

export function getProjectPermissions(role: ProjectRole): ProjectPermission[] {
    switch (role) {
        case "PROJECT_MANAGER":
            return [
                "project:update",
                "project:delete",
                "project:manage-members",
                "project:add-members",
                "project:remove-members",
                "project:update-member-roles",
                "task:create",
                "task:update-any",
                "task:delete-any",
                "task:assign",
                "task:view-all",
                "comment:create",
                "comment:update-any",
                "comment:delete-any",
            ];

        case "PROJECT_COORDINATOR":
            return [
                "task:create",
                "task:update-any",
                "task:delete-any",
                "task:assign",
                "task:view-all",
                "comment:create",
                "comment:update-any",
                "comment:delete-any",
            ];

        case "LEAD":
            return [
                "task:create",
                "task:view-all",
                "comment:create",
                "comment:update-any",
                "comment:delete-any",
            ];

        case "MEMBER":
            return [
                "task:create",
                "task:view-all",
                "comment:create",
            ];

        case "VIEWER":
            return [
                "task:view-all",
            ];

        default:
            return [];
    }
}

export function isProjectAdmin(
    projectRole: ProjectRole | null
): boolean {
    return projectRole === "PROJECT_MANAGER";
}

export function canManageProjectMember(
    managerProjectRole: ProjectRole | null,
    targetProjectRole: ProjectRole
): boolean {
    return managerProjectRole === "PROJECT_MANAGER";
}

export function canAssignProjectRole(
    assignerProjectRole: ProjectRole | null,
    roleToAssign: ProjectRole
): boolean {
    return assignerProjectRole === "PROJECT_MANAGER";
}

export function canRemoveProjectMember(
    removerProjectRole: ProjectRole | null,
    targetProjectRole: ProjectRole
): boolean {
    return removerProjectRole === "PROJECT_MANAGER";
}

export function getProjectRoleLevel(role: ProjectRole): number {
    switch (role) {
        case "PROJECT_MANAGER":
            return 4;
        case "PROJECT_COORDINATOR":
            return 3;
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

export function canUpdateTask(
    projectRole: ProjectRole | null,
    isTaskCreator: boolean,
    isTaskAssignee: boolean
): boolean {
    if (projectRole === "PROJECT_MANAGER" || projectRole === "PROJECT_COORDINATOR") {
        return true;
    }

    if (projectRole === "LEAD") {
        return isTaskCreator;
    }

    if (projectRole === "MEMBER") {
        return isTaskCreator || isTaskAssignee;
    }

    return false;
}

export function canDeleteTask(
    projectRole: ProjectRole | null,
    isTaskCreator: boolean
): boolean {
    if (projectRole === "PROJECT_MANAGER" || projectRole === "PROJECT_COORDINATOR") {
        return true;
    }

    if (projectRole === "LEAD" || projectRole === "MEMBER") {
        return isTaskCreator;
    }

    return false;
}

export function getProjectRoleDisplayName(role: ProjectRole): string {
    switch (role) {
        case "PROJECT_MANAGER":
            return "Project Manager";
        case "PROJECT_COORDINATOR":
            return "Project Coordinator";
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

export function getProjectRoleDescription(role: ProjectRole): string {
    switch (role) {
        case "PROJECT_MANAGER":
            return "Full project access, can manage all aspects including members";
        case "PROJECT_COORDINATOR":
            return "Full task management access. Cannot edit project settings or manage members.";
        case "LEAD":
            return "Limited execution authority, can manage tasks they created but not members";
        case "MEMBER":
            return "Can view only assigned tasks, and edit status to to-do/in-progress/review";
        case "VIEWER":
            return "Read-only access to project";
        default:
            return "";
    }
}
