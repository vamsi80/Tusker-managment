export type WorkspaceRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER" | "PROCUREMENT";

export type WorkspacePermission =
    | "workspace:delete"
    | "workspace:update"
    | "workspace:transfer-ownership"
    | "workspace:manage-members"
    | "workspace:invite-members"
    | "workspace:remove-members"
    | "workspace:update-member-roles"
    | "project:create"
    | "project:delete"
    | "project:update"
    | "project:manage-members"
    | "project:view-all"
    | "project:access-all";

export function hasWorkspacePermission(
    role: WorkspaceRole,
    permission: WorkspacePermission
): boolean {
    const permissions = getWorkspacePermissions(role);
    return permissions.includes(permission);
}

export function getWorkspacePermissions(role: WorkspaceRole): WorkspacePermission[] {
    switch (role) {
        case "OWNER":
            return [
                "workspace:delete",
                "workspace:update",
                "workspace:transfer-ownership",
                "workspace:manage-members",
                "workspace:invite-members",
                "workspace:remove-members",
                "workspace:update-member-roles",
                "project:create",
                "project:delete",
                "project:update",
                "project:manage-members",
                "project:view-all",
                "project:access-all",
            ];

        case "ADMIN":
            return [
                "workspace:update",
                "workspace:manage-members",
                "workspace:invite-members",
                "workspace:remove-members",
                "workspace:update-member-roles",
                "project:create",
                "project:delete",
                "project:update",
                "project:manage-members",
                "project:view-all",
                "project:access-all",
            ];

        case "MANAGER":
            return [
                "project:create",
            ];

        case "MEMBER":
            return [];

        case "VIEWER":
            return [];

        default:
            return [];
    }
}

export function canManageRole(
    managerRole: WorkspaceRole,
    targetRole: WorkspaceRole
): boolean {
    if (managerRole === "OWNER") {
        return true;
    }

    if (managerRole === "ADMIN") {
        return targetRole === "MANAGER" || targetRole === "MEMBER" || targetRole === "VIEWER";
    }

    if (managerRole === "MANAGER") {
        return targetRole === "MEMBER" || targetRole === "VIEWER";
    }

    return false;
}

export function canAssignRole(
    assignerRole: WorkspaceRole,
    roleToAssign: WorkspaceRole
): boolean {
    if (assignerRole === "OWNER") {
        return roleToAssign !== "OWNER";
    }

    if (assignerRole === "ADMIN") {
        return roleToAssign === "MANAGER" || roleToAssign === "MEMBER" || roleToAssign === "VIEWER";
    }

    if (assignerRole === "MANAGER") {
        return roleToAssign === "MEMBER" || roleToAssign === "VIEWER";
    }

    return false;
}

export function canRemoveMember(
    removerRole: WorkspaceRole,
    targetRole: WorkspaceRole,
    isRemovingSelf: boolean
): boolean {
    if (targetRole === "OWNER") {
        return false;
    }

    if (removerRole === "OWNER") {
        return !isRemovingSelf;
    }

    if (removerRole === "ADMIN") {
        return targetRole === "MANAGER" || targetRole === "MEMBER" || targetRole === "VIEWER";
    }

    if (removerRole === "MANAGER") {
        return targetRole === "MEMBER" || targetRole === "VIEWER";
    }

    return false;
}

export function getRoleLevel(role: WorkspaceRole): number {
    switch (role) {
        case "OWNER":
            return 5;
        case "ADMIN":
            return 4;
        case "MANAGER":
            return 3;
        case "MEMBER":
            return 2;
        case "VIEWER":
            return 1;
        default:
            return 0;
    }
}

export function isWorkspaceAdmin(role: WorkspaceRole): boolean {
    return role === "OWNER" || role === "ADMIN";
}

export function hasFullWorkspaceAccess(role: WorkspaceRole): boolean {
    return role === "OWNER" || role === "ADMIN";
}

export function getRoleDisplayName(role: WorkspaceRole): string {
    switch (role) {
        case "OWNER":
            return "Owner";
        case "ADMIN":
            return "Admin";
        case "MANAGER":
            return "Manager";
        case "MEMBER":
            return "Member";
        case "VIEWER":
            return "Viewer";
        default:
            return "Unknown";
    }
}

export function getRoleDescription(role: WorkspaceRole): string {
    switch (role) {
        case "OWNER":
            return "Full control over workspace, can transfer ownership";
        case "ADMIN":
            return "Can manage workspace, projects, and members";
        case "MANAGER":
            return "Can create projects and manage members";
        case "MEMBER":
            return "Can access assigned projects and create tasks";
        case "VIEWER":
            return "Read-only access to assigned projects";
        default:
            return "";
    }
}
