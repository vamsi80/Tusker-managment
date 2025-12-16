"use server";

import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { EditProjectSchemaType, editProjectSchema } from "@/lib/zodSchemas";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { isProjectAdmin } from "@/lib/constants/project-access";

export async function editProject(values: EditProjectSchemaType): Promise<ApiResponse> {

    try {
        // Validate input
        const validation = editProjectSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Please check the form details and try again.",
            };
        }

        // Fetch project with workspace members for member access updates
        const project = await prisma.project.findUnique({
            where: { id: values.projectId },
            include: {
                workspace: {
                    include: {
                        members: true,
                    },
                },
                clint: true,
            },
        });

        if (!project) {
            return {
                status: "error",
                message: "Project not found.",
            };
        }

        // Get user permissions for this project
        const permissions = await getUserPermissions(project.workspaceId, values.projectId);

        // Check if user has admin access (workspace admin or project lead)
        const workspaceRole = permissions.workspaceMember?.workspaceRole;
        const projectRole = permissions.projectMember?.projectRole || null;

        if (!workspaceRole || !isProjectAdmin(projectRole, workspaceRole)) {
            return {
                status: "error",
                message: "Only workspace owners/admins and project leads can edit projects.",
            };
        }


        // 3. Check if slug is unique (if slug is being changed)
        if (validation.data.slug && validation.data.slug !== project.slug) {
            const existingProject = await prisma.project.findFirst({
                where: {
                    workspaceId: project.workspaceId,
                    slug: validation.data.slug,
                    id: { not: values.projectId },
                },
            });

            if (existingProject) {
                return {
                    status: "error",
                    message: "A project with this slug already exists in the workspace.",
                };
            }
        }

        // 4. Build workspace member map for member access updates
        const workspaceMemberMap = new Map<string, string>();
        for (const wm of project.workspace.members) {
            if (wm?.userId && wm?.id) {
                workspaceMemberMap.set(String(wm.userId), String(wm.id));
            }
        }

        // 5. Update project and client in a transaction
        await prisma.$transaction(async (tx) => {
            // Update project basic info
            await tx.project.update({
                where: { id: values.projectId },
                data: {
                    name: validation.data.name,
                    description: validation.data.description,
                    slug: validation.data.slug || project.slug,
                },
            });

            // Update client info if provided and client exists
            const clientRecord = project.clint?.[0]; // clint is an array, get first one
            if (clientRecord) {
                await tx.clints.update({
                    where: { id: clientRecord.id },
                    data: {
                        ...(validation.data.companyName && { name: validation.data.companyName }),
                        ...(validation.data.registeredCompanyName && { registeredCompanyName: validation.data.registeredCompanyName }),
                        ...(validation.data.directorName && { directorName: validation.data.directorName }),
                        ...(validation.data.address && { address: validation.data.address }),
                        ...(validation.data.gstNumber && { gstNumber: validation.data.gstNumber }),
                    },
                });

                // Update client member contact info if provided
                if (validation.data.contactPerson || validation.data.contactNumber) {
                    const clientMember = await tx.clintMembers.findFirst({
                        where: { clintId: clientRecord.id },
                    });

                    if (clientMember) {
                        await tx.clintMembers.update({
                            where: { id: clientMember.id },
                            data: {
                                ...(validation.data.contactPerson && { name: validation.data.contactPerson }),
                                ...(validation.data.contactNumber && { contactNumber: validation.data.contactNumber }),
                            },
                        });
                    }
                }
            }

            // Update project lead if provided
            if (validation.data.projectLead) {
                const projectLeadUserId = String(validation.data.projectLead);
                const leadWorkspaceMemberId = workspaceMemberMap.get(projectLeadUserId);

                if (leadWorkspaceMemberId) {
                    // Find existing lead
                    const existingLead = await tx.projectMember.findFirst({
                        where: {
                            projectId: values.projectId,
                            projectRole: "LEAD"
                        }
                    });

                    // If the lead is changing
                    if (existingLead && existingLead.workspaceMemberId !== leadWorkspaceMemberId) {
                        // Demote old lead to MEMBER
                        await tx.projectMember.update({
                            where: { id: existingLead.id },
                            data: { projectRole: "MEMBER" }
                        });

                        // Check if new lead already exists as a member
                        const newLeadMember = await tx.projectMember.findFirst({
                            where: {
                                projectId: values.projectId,
                                workspaceMemberId: leadWorkspaceMemberId
                            }
                        });

                        if (newLeadMember) {
                            // Promote existing member to LEAD
                            await tx.projectMember.update({
                                where: { id: newLeadMember.id },
                                data: { projectRole: "LEAD" }
                            });
                        } else {
                            // Create new lead member
                            await tx.projectMember.create({
                                data: {
                                    projectId: values.projectId,
                                    workspaceMemberId: leadWorkspaceMemberId,
                                    hasAccess: true,
                                    projectRole: "LEAD"
                                }
                            });
                        }
                    }
                }
            }
        });

        // 6. Invalidate project cache
        const { invalidateWorkspaceProjects } = await import(
            "@/lib/cache/invalidation"
        );
        await invalidateWorkspaceProjects(project.workspaceId);

        return {
            status: "success",
            message: "Project updated successfully.",
        };
    } catch (err) {
        console.error("Error updating project:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while updating the project. Please try again later.",
        };
    }
}