import "server-only";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";

/**
 * Check if the current user has admin-level access to a project.
 * Admin-level access is granted to:
 * 1. Workspace OWNER and ADMINs (they have admin access to ALL projects in the workspace)
 * 2. Project LEADs (they have admin access to their specific project)
 * 
 * @param projectId - The ID of the project to check access for
 * @param includeAllWorkspaceMembers - If true, includes all workspace members (needed for member management)
 * @returns Object with isAdmin boolean and user/project data
 */
export async function checkProjectAdminAccess(projectId: string, includeAllWorkspaceMembers = false) {
    const user = await requireUser();

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
            workspace: {
                include: {
                    members: includeAllWorkspaceMembers ? true : {
                        where: { userId: user.id }
                    }
                }
            },
            clint: true,
            projectMembers: {
                where: {
                    workspaceMember: {
                        userId: user.id
                    }
                },
                include: {
                    workspaceMember: true
                }
            }
        }
    });

    if (!project) {
        return {
            isAdmin: false,
            isWorkspaceAdmin: false,
            isProjectLead: false,
            user,
            project: null,
            workspaceMember: null,
            projectMember: null
        };
    }

    const workspaceMember = includeAllWorkspaceMembers
        ? project.workspace.members.find(m => m.userId === user.id)
        : project.workspace.members[0];
    const projectMember = project.projectMembers[0];

    // Check if user is workspace admin (OWNER or ADMIN)
    const isWorkspaceAdmin = workspaceMember?.workspaceRole === "OWNER" || workspaceMember?.workspaceRole === "ADMIN";

    // Check if user is project lead
    const isProjectLead = projectMember?.projectRole === "LEAD";

    // User has admin access if they are either workspace admin OR project lead
    const isAdmin = isWorkspaceAdmin || isProjectLead;

    return {
        isAdmin,
        isWorkspaceAdmin,
        isProjectLead,
        user,
        project,
        workspaceMember,
        projectMember
    };
}

/**
 * Require admin-level access to a project. Throws/redirects if user doesn't have access.
 * 
 * @param projectId - The ID of the project
 * @param errorMessage - Custom error message (optional)
 * @returns Object with user and project data
 */
export async function requireProjectAdmin(
    projectId: string,
    errorMessage = "Only workspace owners/admins and project leads can perform this action."
) {
    const access = await checkProjectAdminAccess(projectId);

    if (!access.isAdmin) {
        throw new Error(errorMessage);
    }

    return {
        user: access.user,
        project: access.project!,
        workspaceMember: access.workspaceMember!,
        projectMember: access.projectMember,
        isWorkspaceAdmin: access.isWorkspaceAdmin,
        isProjectLead: access.isProjectLead
    };
}
