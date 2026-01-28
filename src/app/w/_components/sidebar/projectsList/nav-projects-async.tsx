import { getUserProjects } from "@/data/project/get-projects";
import { isAdminServer } from "@/lib/auth/requireAdmin";
import { NavProjects } from "./nav-projects";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";

interface NavProjectsAsyncProps {
    workspaceId: string;
}

export async function NavProjectsAsync({ workspaceId }: NavProjectsAsyncProps) {
    let projects: Awaited<ReturnType<typeof getUserProjects>> | null = null;
    let workspaceMembers: Awaited<
        ReturnType<typeof getWorkspaceMembers>
    >["workspaceMembers"] | null = null;
    let isAdmin = false;

    try {
        const results = await Promise.all([
            getUserProjects(workspaceId),
            getWorkspaceMembers(workspaceId),
            isAdminServer(workspaceId),
        ]);

        projects = results[0];
        workspaceMembers = results[1].workspaceMembers;
        isAdmin = results[2];
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
            isAdmin={isAdmin}
        />
    );
}
