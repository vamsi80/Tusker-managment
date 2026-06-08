import { getDb } from "@/lib/registry";

/**
 * Get workspace-level permissions for the current user
 * Use this for workspace-level queries (no specific project)
 */
/**
 * Internal function to fetch workspace permissions
 */
async function _fetchWorkspacePermissionsInternal(workspaceId: string, userId: string, lean: boolean = false) {
    try {
        const workspaceMember = await getDb().workspaceMember.findFirst({
            where: { workspaceId: workspaceId, userId: userId },
            include: {
                user: {
                    select: {
                        id: true,
                        surname: true,
                    }
                },
                reportTo: {
                    select: {
                        user: {
                            select: {
                                surname: true,
                            }
                        }
                    }
                }
            }
        });

        const reportingManagerName = workspaceMember?.reportTo?.user?.surname || null;

        if (!workspaceMember) {
            return {
                isWorkspaceAdmin: false,
                canCreateProject: false,
                isProjectLead: false,
                isProjectManager: false,
                hasAccess: false,
                workspaceMemberId: null,
                workspaceRole: null,
                userId: null,
                reportingManagerName: null,
                ...(lean ? {} : {
                    leadProjectIds: [],
                    managedProjectIds: [],
                    memberProjectIds: [],
                    viewerProjectIds: []
                })
            } as any;
        }

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
        const canCreateProject = isWorkspaceAdmin || workspaceMember.workspaceRole === "MANAGER";

        let leadProjectIds: string[] = [];
        let managedProjectIds: string[] = [];
        let coordinatorProjectIds: string[] = [];
        let memberProjectIds: string[] = [];
        let viewerProjectIds: string[] = [];

        if (isWorkspaceAdmin) {
            // 🚀 Admin Override: Grant access to ALL projects in the workspace
            // If lean, we skip fetching all project IDs because it's only needed for deep filtering
            if (lean) {
                return {
                    isWorkspaceAdmin,
                    canCreateProject,
                    isProjectLead: true,
                    isProjectManager: true,
                    isProjectCoordinator: true,
                    hasAccess: true,
                    workspaceMemberId: workspaceMember.id,
                    workspaceRole: workspaceMember.workspaceRole,
                    userId: workspaceMember.userId,
                    userSurname: workspaceMember.user?.surname,
                    reportingManagerName,
                } as any;
            }

            // Fetch project IDs only for admin users on the non-lean path.
            const allProjectsSpeculative = await getDb().project.findMany({
                where: { workspaceId },
                select: { id: true },
            });
            const allIds = allProjectsSpeculative.map(p => p.id);
            leadProjectIds = allIds;
            managedProjectIds = allIds;
            coordinatorProjectIds = allIds;
            memberProjectIds = allIds;
        } else {
            // Standard User: Fetch explicit roles
            const projectRoles = await getDb().projectMember.findMany({
                where: {
                    workspaceMember: {
                        userId: userId,
                        workspaceId: workspaceId,
                    },
                },
                select: {
                    projectId: true,
                    projectRole: true,
                },
            });

            managedProjectIds = projectRoles.filter(p => p.projectRole === "PROJECT_MANAGER").map(p => p.projectId);
            leadProjectIds = projectRoles.filter(p => p.projectRole === "LEAD").map(p => p.projectId);
            coordinatorProjectIds = projectRoles.filter(p => p.projectRole === "PROJECT_COORDINATOR").map(p => p.projectId);
            memberProjectIds = projectRoles.filter(p => p.projectRole === "MEMBER").map(p => p.projectId);
            viewerProjectIds = projectRoles.filter(p => p.projectRole === "VIEWER").map(p => p.projectId);
        }

        const isProjectManager = isWorkspaceAdmin || managedProjectIds.length > 0;
        const isProjectLead = isWorkspaceAdmin || leadProjectIds.length > 0;
        const isProjectCoordinator = isWorkspaceAdmin || coordinatorProjectIds.length > 0;
        const hasAccess = isWorkspaceAdmin || isProjectManager || isProjectLead || isProjectCoordinator || memberProjectIds.length > 0 || viewerProjectIds.length > 0;

        return {
            isWorkspaceAdmin,
            canCreateProject,
            isProjectLead,
            isProjectManager,
            isProjectCoordinator,
            hasAccess,
            workspaceMemberId: workspaceMember.id,
            workspaceRole: workspaceMember.workspaceRole,
            userId: workspaceMember.userId,
            userSurname: workspaceMember.user?.surname,
            reportingManagerName,
            ...(lean ? {} : {
                leadProjectIds,
                managedProjectIds,
                coordinatorProjectIds,
                memberProjectIds,
                viewerProjectIds,
            })
        } as any;
    } catch (error) {
        console.error("Error fetching workspace permissions:", error);
        return {
            isWorkspaceAdmin: false,
            canCreateProject: false,
            isProjectLead: false,
            isProjectManager: false,
            hasAccess: false,
            workspaceMemberId: null,
            workspaceRole: null,
            userId: null,
            userSurname: null,
            reportingManagerName: null,
            leadProjectIds: [],
            managedProjectIds: [],
        };
    }
}

/**
 * Get workspace-level permissions for the current user
 */
export const getWorkspacePermissions = async (workspaceId: string, userId: string, lean: boolean = false) => {
    return _fetchWorkspacePermissionsInternal(workspaceId, userId, lean);
};

/**
 * Get project-level permissions for the current user
 * Use this for project-specific queries
 */
/**
 * Internal function to fetch project permissions
 */
async function _getUserPermissionsInternal(workspaceId: string, projectId: string, userId: string) {
    try {
        const [workspaceMember, projectMember] = await Promise.all([
            getDb().workspaceMember.findFirst({
                where: { workspaceId, userId },
                include: {
                    user: {
                        select: {
                            id: true,
                            surname: true,
                            name: true,
                        }
                    }
                }
            }),
            getDb().projectMember.findFirst({
                where: {
                    projectId,
                    workspaceMember: { userId },
                },
            }),
        ]);

        if (!workspaceMember) {
            return {
                isWorkspaceAdmin: false,
                isProjectManager: false,
                isProjectLead: false,
                isMember: false,
                canCreateSubTask: false,
                canPerformBulkOperations: false,
                workspaceMemberId: null,
                workspaceRole: null,
                userId: null,
                userSurname: null,
                projectMember: null,
            };
        }

        const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";

        // Project role is determined STRICTLY from the ProjectMember table for THIS project.
        // Workspace ADMIN/OWNER status does NOT automatically grant PM or Lead rights here.
        // isWorkspaceAdmin is still available as a separate flag for system-level operations.
        const isProjectManager = projectMember?.projectRole === "PROJECT_MANAGER";
        const isProjectCoordinator = projectMember?.projectRole === "PROJECT_COORDINATOR";
        const isProjectLead = projectMember?.projectRole === "LEAD";
        const isMember = projectMember?.projectRole === "MEMBER";

        // Only PM, Coordinator and Lead can create subtasks or perform bulk operations.
        const canCreateSubTask = isProjectManager || isProjectLead || isProjectCoordinator;
        const canPerformBulkOperations = isProjectManager || isProjectLead || isProjectCoordinator;

        return {
            isWorkspaceAdmin,
            isProjectManager,
            isProjectCoordinator,
            isProjectLead,
            isMember,
            canCreateSubTask,
            canPerformBulkOperations,
            workspaceMemberId: workspaceMember.id,
            workspaceRole: workspaceMember.workspaceRole,
            userId: workspaceMember.userId,
            userSurname: workspaceMember.user?.surname || workspaceMember.user?.name || null,
            projectMember: projectMember ? {
                id: projectMember.id,
                projectRole: projectMember.projectRole,
            } : null,
        };
    } catch (error) {
        console.error("Error fetching user permissions:", error);
        return {
            isWorkspaceAdmin: false,
            isProjectManager: false,
            isProjectCoordinator: false,
            isProjectLead: false,
            isMember: false,
            canCreateSubTask: false,
            canPerformBulkOperations: false,
            workspaceMemberId: null,
            workspaceRole: null,
            userId: null,
            userSurname: null,
            projectMember: null,
        };
    }
}

/**
 * Get project-level permissions for the current user
 */
export const getUserPermissions = async (workspaceId: string, projectId: string, userId: string) => {
    return _getUserPermissionsInternal(workspaceId, projectId, userId);
};

export type WorkspacePermissionsType = Awaited<ReturnType<typeof getWorkspacePermissions>>;
export type UserPermissionsType = Awaited<ReturnType<typeof getUserPermissions>>;
