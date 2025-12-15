"use server";

import { requireUser } from "@/app/data/user/require-user";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { projectSchema, ProjectSchemaType } from "@/lib/zodSchemas";
import { ProjectRole } from "@/generated/prisma/client";
import { hasWorkspacePermission } from "@/lib/constants/workspace-access";

export async function createProject(values: ProjectSchemaType): Promise<ApiResponse> {
    const user = await requireUser();

    const validation = projectSchema.safeParse(values);
    if (!validation.success) {
        return {
            status: "error",
            message: "Please check the form details and try again.",
        };
    }

    if (!values?.workspaceId) {
        return {
            status: "error",
            message: "We couldn't identify the workspace. Please refresh the page and try again.",
        };
    }

    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: values.workspaceId },
            include: {
                members: {
                    include: { user: true },
                },
            },
        });

        if (!workspace) {
            return { status: "error", message: "The requested workspace could not be found." };
        }

        const workspaceMembers = workspace.members || [];

        if (workspaceMembers.length === 0) {
            return {
                status: "error",
                message: "This workspace doesn't have any members yet.",
            };
        }

        const currentMemberRecord = workspaceMembers.find(
            (m) => String(m.userId) === String(user.id)
        );

        if (!currentMemberRecord) {
            return {
                status: "error",
                message: "You must be a member of this workspace to create a project.",
            };
        }

        // Check if user has permission to create projects (OWNER or ADMIN)
        if (!hasWorkspacePermission(currentMemberRecord.workspaceRole, "project:create")) {
            return {
                status: "error",
                message: "Only workspace owners and admins can create projects.",
            };
        }

        const membersWithRoleMember = workspaceMembers.filter(
            (member) => member.workspaceRole === "MEMBER"
        );

        if (membersWithRoleMember.length < 2) {
            return {
                status: "error",
                message: "At least 2 members with the 'MEMBER' role are required to create a project.",
            };
        }

        // Get the project lead user ID (default to current user if not provided)
        const projectLeadUserId = values.projectLead ? String(values.projectLead) : String(user.id);

        // Build map userId -> workspaceMemberId for quick lookup
        const workspaceMemberMap = new Map<string, string>();
        for (const wm of workspaceMembers) {
            if (wm?.userId && wm?.id) workspaceMemberMap.set(String(wm.userId), String(wm.id));
        }

        // Get the workspace member ID for the project lead
        const leadWorkspaceMemberId = workspaceMemberMap.get(projectLeadUserId);

        if (!leadWorkspaceMemberId) {
            return {
                status: "error",
                message: "The selected project lead is not a member of this workspace.",
            };
        }

        // Create only the project lead as a member with LEAD role
        const projectMemberCreate = {
            workspaceMember: { connect: { id: leadWorkspaceMemberId } },
            hasAccess: true,
            projectRole: "LEAD" as ProjectRole,
        };

        // Create project with nested create using relation connect form
        await prisma.$transaction([
            prisma.project.create({
                data: {
                    name: validation.data.name,
                    description: validation.data.description,
                    slug: validation.data.slug,
                    workspaceId: values.workspaceId,
                    projectMembers: {
                        create: projectMemberCreate,
                    },
                    clint: {
                        create: {
                            name: validation.data.companyName,
                            registeredCompanyName: validation.data.registeredCompanyName,
                            directorName: validation.data.directorName,
                            address: validation.data.address,
                            gstNumber: validation.data.gstNumber,
                            clintMembers: {
                                create: {
                                    name: validation.data.contactPerson,
                                    contactNumber: validation.data.contactNumber,
                                },
                            },
                        },
                    },
                },
            }),
        ]);

        // Invalidate project cache for all users in the workspace
        const { invalidateWorkspaceProjects } = await import("@/app/data/user/invalidate-project-cache");
        await invalidateWorkspaceProjects(values.workspaceId);

        return {
            status: "success",
            message: "Project created successfully! You can now start adding tasks.",
        };
    } catch (err) {
        console.error("Error creating project:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while creating the project. Please try again later.",
        };
    }
}
