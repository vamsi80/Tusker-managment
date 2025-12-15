"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";

export interface FullProjectData {
    id: string;
    name: string;
    description: string | null;
    slug: string;
    workspaceId: string;
    // Client data
    companyName: string | null;
    registeredCompanyName: string | null;
    directorName: string | null;
    address: string | null;
    gstNumber: string | null;
    contactPerson: string | null;
    contactNumber: string | null;
    // Team data
    projectLead: string | null;
    memberAccess: string[];
    // Project members with full details
    projectMembers?: Array<{
        id: string;
        userId: string;
        userName: string;
        projectRole: "LEAD" | "MEMBER" | "VIEWER";
        hasAccess: boolean;
    }>;
}

/**
 * Fetch complete project data including client info and team members
 * Used for editing projects
 */
export async function getFullProjectData(projectId: string): Promise<FullProjectData | null> {
    const user = await requireUser();

    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                clint: {
                    include: {
                        clintMembers: true,
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
                workspace: {
                    include: {
                        members: true,
                    },
                },
            },
        });

        if (!project) {
            return null;
        }

        // Check user has access to this project
        const workspaceMember = project.workspace.members.find(
            (m) => m.userId === user.id
        );

        if (!workspaceMember) {
            return null;
        }

        // Get client data (first client if exists)
        const clientRecord = project.clint?.[0];
        const clientMember = clientRecord?.clintMembers?.[0];

        // Find project lead (member with LEAD role)
        const projectLead = project.projectMembers.find(
            (pm) => pm.projectRole === "LEAD"
        );

        // Get all member userIds
        const memberAccess = project.projectMembers
            .filter((pm) => pm.projectRole !== "LEAD")
            .map((pm) => pm.workspaceMember.userId);

        // Map project members with full details
        const projectMembersData = project.projectMembers.map((pm) => ({
            id: pm.id,
            userId: pm.workspaceMember.userId,
            userName: pm.workspaceMember.user?.surname || "Unknown",
            projectRole: pm.projectRole,
            hasAccess: pm.hasAccess,
        }));

        return {
            id: project.id,
            name: project.name,
            description: project.description,
            slug: project.slug,
            workspaceId: project.workspaceId,
            // Client data
            companyName: clientRecord?.name || null,
            registeredCompanyName: clientRecord?.registeredCompanyName || null,
            directorName: clientRecord?.directorName || null,
            address: clientRecord?.address || null,
            gstNumber: clientRecord?.gstNumber || null,
            contactPerson: clientMember?.name || null,
            contactNumber: clientMember?.contactNumber || null,
            // Team data
            projectLead: projectLead?.workspaceMember.userId || null,
            memberAccess: memberAccess,
            // Project members
            projectMembers: projectMembersData,
        };
    } catch (error) {
        console.error("Error fetching project data:", error);
        return null;
    }
}
