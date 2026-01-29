"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";

export type ProjectReviewer = {
    id: string; // userId
    name: string;
    image: string | null;
    role: string; // "Owner", "Admin", "Project Manager", "Lead"
};

export async function getProjectReviewers(projectId: string): Promise<ProjectReviewer[]> {
    const user = await requireUser();

    // 1. Get project with workspaceId to check workspace roles
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { workspaceId: true }
    });

    if (!project) return [];

    // 2. Fetch all members of the workspace who have access to this project
    // We want to include:
    // - Workspace OWNER/ADMIN (implicit access)
    // - Project PROJECT_MANAGER/LEAD

    // We can fetch from WorkspaceMember joined with ProjectMember

    // Fetch Workspace Members who are Owner/Admin
    const admins = await prisma.workspaceMember.findMany({
        where: {
            workspaceId: project.workspaceId,
            workspaceRole: { in: ["OWNER", "ADMIN"] }
        },
        include: { user: true }
    });

    // Fetch Project Members who are PM/Lead
    const projectLeaders = await prisma.projectMember.findMany({
        where: {
            projectId: projectId,
            projectRole: { in: ["PROJECT_MANAGER", "LEAD"] }
        },
        include: {
            workspaceMember: {
                include: { user: true }
            }
        }
    });

    // Combine and deduplicate
    const reviewerMap = new Map<string, ProjectReviewer>();

    // Add Admins
    admins.forEach(m => {
        reviewerMap.set(m.userId, {
            id: m.userId,
            name: m.user.name,
            image: m.user.image,
            role: m.workspaceRole // OWNER or ADMIN
        });
    });

    // Add Project Leaders (override role with project role if they are not admin, or keep admin?)
    // Actually Admin role is higher.
    projectLeaders.forEach(pm => {
        const userId = pm.workspaceMember.userId;
        const current = reviewerMap.get(userId);

        // If not already added (as Admin), add as PM/Lead
        if (!current) {
            reviewerMap.set(userId, {
                id: userId,
                name: pm.workspaceMember.user.name,
                image: pm.workspaceMember.user.image,
                role: pm.projectRole // PROJECT_MANAGER or LEAD
            });
        }
    });

    return Array.from(reviewerMap.values());
}
