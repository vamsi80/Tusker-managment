"use server";

import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { ProjectRole } from "@/generated/prisma/client";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { invalidateWorkspaceProjects } from "@/lib/cache/invalidation";

/**
 * Add members to an existing project
 * Only workspace admins and project leads can add members
 */
export async function addProjectMembers(
    projectId: string,
    memberUserIds: string[]
): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        // Validate input
        if (!projectId) {
            return {
                status: "error",
                message: "Project ID is required.",
            };
        }

        if (!memberUserIds || memberUserIds.length === 0) {
            return {
                status: "error",
                message: "At least one member must be selected.",
            };
        }

        // Get project
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                workspace: {
                    include: {
                        members: {
                            include: {
                                user: true,
                            },
                        },
                    },
                },
                projectMembers: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: true,
                            },
                        },
                    },
                },
            },
        });

        if (!project) {
            return {
                status: "error",
                message: "Project not found.",
            };
        }

        // Check permissions using centralized function
        const permissions = await getUserPermissions(project.workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return {
                status: "error",
                message: "You are not a member of this workspace.",
            };
        }

        // Only workspace admins (OWNER/ADMIN) and project leads can add members
        if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
            return {
                status: "error",
                message: "Only workspace owners/admins and project leads can add members.",
            };
        }

        // Build workspace member map
        const workspaceMemberMap = new Map<string, string>();
        for (const wm of project.workspace.members) {
            if (wm?.userId && wm?.id) {
                workspaceMemberMap.set(String(wm.userId), String(wm.id));
            }
        }

        // Get existing project member user IDs
        const existingMemberUserIds = new Set(
            project.projectMembers.map((pm) => pm.workspaceMember.userId)
        );

        // Filter out members who are already in the project
        const newMemberUserIds = memberUserIds.filter(
            (userId) => !existingMemberUserIds.has(userId)
        );

        if (newMemberUserIds.length === 0) {
            return {
                status: "error",
                message: "All selected members are already in the project.",
            };
        }

        // Prepare new members data
        const newMembers = newMemberUserIds
            .map((userId) => {
                const wmId = workspaceMemberMap.get(String(userId));
                if (!wmId) return null;

                return {
                    projectId: projectId,
                    workspaceMemberId: wmId,
                    hasAccess: true,
                    projectRole: "MEMBER" as ProjectRole,
                };
            })
            .filter(Boolean) as Array<{
                projectId: string;
                workspaceMemberId: string;
                hasAccess: boolean;
                projectRole: ProjectRole;
            }>;

        if (newMembers.length === 0) {
            return {
                status: "error",
                message: "Selected users are not members of this workspace.",
            };
        }

        // Add new members
        await prisma.projectMember.createMany({
            data: newMembers,
        });
        await invalidateWorkspaceProjects(project.workspaceId);

        return {
            status: "success",
            message: `Successfully added ${newMembers.length} member(s) to the project.`,
        };
    } catch (err) {
        console.error("Error adding project members:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while adding members. Please try again later.",
        };
    }
}

/**
 * Remove members from a project
 * Only workspace admins and project leads can remove members
 * Cannot remove the last project lead
 */
export async function removeProjectMembers(
    projectId: string,
    memberUserIds: string[]
): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        // Validate input
        if (!projectId) {
            return {
                status: "error",
                message: "Project ID is required.",
            };
        }

        if (!memberUserIds || memberUserIds.length === 0) {
            return {
                status: "error",
                message: "At least one member must be selected.",
            };
        }

        // Get project
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                workspace: {
                    include: {
                        members: {
                            include: {
                                user: true,
                            },
                        },
                    },
                },
                projectMembers: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: true,
                            },
                        },
                    },
                },
            },
        });

        if (!project) {
            return {
                status: "error",
                message: "Project not found.",
            };
        }

        // Check permissions using centralized function
        const permissions = await getUserPermissions(project.workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return {
                status: "error",
                message: "You are not a member of this workspace.",
            };
        }

        // Only workspace admins and project leads can remove members
        if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
            return {
                status: "error",
                message: "Only workspace admins and project leads can remove members.",
            };
        }

        // Get workspace member IDs to remove
        const workspaceMemberIdsToRemove = project.projectMembers
            .filter((pm) => memberUserIds.includes(pm.workspaceMember.userId))
            .map((pm) => pm.workspaceMemberId);

        if (workspaceMemberIdsToRemove.length === 0) {
            return {
                status: "error",
                message: "Selected members are not in this project.",
            };
        }

        // Check if we're removing all project leads
        const currentLeads = project.projectMembers.filter(
            (pm) => pm.projectRole === "LEAD"
        );
        const remainingLeads = currentLeads.filter(
            (pm) => !workspaceMemberIdsToRemove.includes(pm.workspaceMemberId)
        );

        if (currentLeads.length > 0 && remainingLeads.length === 0) {
            return {
                status: "error",
                message: "Cannot remove all project leads. At least one lead must remain.",
            };
        }

        // Remove members
        await prisma.projectMember.deleteMany({
            where: {
                projectId: projectId,
                workspaceMemberId: {
                    in: workspaceMemberIdsToRemove,
                },
            },
        });
        await invalidateWorkspaceProjects(project.workspaceId);

        return {
            status: "success",
            message: `Successfully removed ${workspaceMemberIdsToRemove.length} member(s) from the project.`,
        };
    } catch (err) {
        console.error("Error removing project members:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while removing members. Please try again later.",
        };
    }
}

/**
 * Update a project member's role
 * Only workspace admins and project leads can update roles
 * Cannot demote the last project lead
 */
export async function updateProjectMemberRole(
    projectId: string,
    memberUserId: string,
    newRole: ProjectRole
): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        // Validate input
        if (!projectId) {
            return {
                status: "error",
                message: "Project ID is required.",
            };
        }

        if (!memberUserId) {
            return {
                status: "error",
                message: "Member ID is required.",
            };
        }

        if (!newRole || !["LEAD", "MEMBER", "VIEWER"].includes(newRole)) {
            return {
                status: "error",
                message: "Invalid role. Must be LEAD, MEMBER, or VIEWER.",
            };
        }

        // Get project
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                workspace: {
                    include: {
                        members: true,
                    },
                },
                projectMembers: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: true,
                            },
                        },
                    },
                },
            },
        });

        if (!project) {
            return {
                status: "error",
                message: "Project not found.",
            };
        }

        // Check permissions using centralized function
        const permissions = await getUserPermissions(project.workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return {
                status: "error",
                message: "You are not a member of this workspace.",
            };
        }

        // Only workspace admins and project leads can update member roles
        if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
            return {
                status: "error",
                message: "Only workspace admins and project leads can update member roles.",
            };
        }

        // Find the member to update
        const targetMember = project.projectMembers.find(
            (pm) => pm.workspaceMember.userId === memberUserId
        );

        if (!targetMember) {
            return {
                status: "error",
                message: "Member not found in this project.",
            };
        }

        // Check if we're demoting the last lead
        if (targetMember.projectRole === "LEAD" && newRole !== "LEAD") {
            const currentLeads = project.projectMembers.filter(
                (pm) => pm.projectRole === "LEAD"
            );

            if (currentLeads.length === 1) {
                return {
                    status: "error",
                    message: "Cannot demote the last project lead. Promote another member to lead first.",
                };
            }
        }

        // Update the member's role
        await prisma.projectMember.update({
            where: { id: targetMember.id },
            data: {
                projectRole: newRole,
            },
        });

        // Invalidate project cache
        await invalidateWorkspaceProjects(project.workspaceId);

        const memberName = targetMember.workspaceMember.user?.surname || "Member";
        return {
            status: "success",
            message: `Successfully updated ${memberName}'s role to ${newRole}.`,
        };
    } catch (err) {
        console.error("Error updating project member role:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while updating the member role. Please try again later.",
        };
    }
}

/**
 * Toggle member access (enable/disable)
 * Only workspace admins and project leads can toggle access
 */
export async function toggleProjectMemberAccess(
    projectId: string,
    memberUserId: string
): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        // Validate input
        if (!projectId) {
            return {
                status: "error",
                message: "Project ID is required.",
            };
        }

        if (!memberUserId) {
            return {
                status: "error",
                message: "Member ID is required.",
            };
        }

        // Get project
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                workspace: {
                    include: {
                        members: true,
                    },
                },
                projectMembers: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: true,
                            },
                        },
                    },
                },
            },
        });

        if (!project) {
            return {
                status: "error",
                message: "Project not found.",
            };
        }

        // Check permissions using centralized function
        const permissions = await getUserPermissions(project.workspaceId, projectId);

        if (!permissions.workspaceMemberId) {
            return {
                status: "error",
                message: "You are not a member of this workspace.",
            };
        }

        // Only workspace admins and project leads can toggle member access
        if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
            return {
                status: "error",
                message: "Only workspace admins and project leads can toggle member access.",
            };
        }

        // Find the member to update
        const targetMember = project.projectMembers.find(
            (pm) => pm.workspaceMember.userId === memberUserId
        );

        if (!targetMember) {
            return {
                status: "error",
                message: "Member not found in this project.",
            };
        }

        // Toggle access
        const newAccessState = !targetMember.hasAccess;

        await prisma.projectMember.update({
            where: { id: targetMember.id },
            data: {
                hasAccess: newAccessState,
            },
        });

        // Invalidate project cache
        await invalidateWorkspaceProjects(project.workspaceId);

        return {
            status: "success",
            message: `Successfully ${newAccessState ? "enabled" : "disabled"} access for the member.`,
        };
    } catch (err) {
        console.error("Error toggling project member access:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while toggling member access. Please try again later.",
        };
    }
}
