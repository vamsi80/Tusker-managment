import { getUserProjects } from "@/data/project/get-projects";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { NavProjects } from "./nav-projects";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { requireUser } from "@/lib/auth/require-user";
import prisma from "@/lib/db";

interface NavProjectsAsyncProps {
    workspaceId: string;
}

export async function NavProjectsAsync({ workspaceId }: NavProjectsAsyncProps) {
    let projects: Awaited<ReturnType<typeof getUserProjects>> | null = null;
    let workspaceMembers: Awaited<
        ReturnType<typeof getWorkspaceMembers>
    >["workspaceMembers"] | null = null;
    let permissions = { isWorkspaceAdmin: false, canCreateProject: false };
    let userRole: string | undefined;
    let currentUserId: string | undefined;

    try {
        const user = await requireUser();
        currentUserId = user.id;

        // Fetch workspace member to get role
        const workspaceMember = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: user.id,
                    workspaceId,
                },
            },
            select: {
                workspaceRole: true,
            },
        });

        userRole = workspaceMember?.workspaceRole;

        const results = await Promise.all([
            getUserProjects(workspaceId),
            getWorkspaceMembers(workspaceId),
            getWorkspacePermissions(workspaceId),
        ]);

        projects = results[0];
        workspaceMembers = results[1].workspaceMembers;
        permissions = results[2];
    } catch (error) {
        console.error("Error loading sidebar projects:", error);
        return null;
    }

    // ✅ JSX is OUTSIDE try/catch
    if (!projects || !workspaceMembers) return null;

    return (
        <NavProjects
            projects={projects}
            workspaceId={workspaceId}
            members={workspaceMembers}
            isAdmin={permissions.isWorkspaceAdmin}
            canCreateProject={permissions.canCreateProject}
            userRole={userRole}
            currentUserId={currentUserId}
        />
    );
}
