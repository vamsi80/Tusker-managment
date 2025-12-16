import { getUserProjects } from "@/data/user/get-user-projects";
import { isAdminServer } from "@/data/user/requireAdmin";
import { NavProjects } from "./nav-projects";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";

interface NavProjectsAsyncProps {
    workspaceId: string;
}

export async function NavProjectsAsync({ workspaceId }: NavProjectsAsyncProps) {
    const [projects, { workspaceMembers }, isAdmin] = await Promise.all([
        getUserProjects(workspaceId),
        getWorkspaceMembers(workspaceId),
        isAdminServer(workspaceId),
    ]);

    return (
        <NavProjects
            projects={projects}
            workspaceId={workspaceId}
            members={workspaceMembers}
            isAdmin={isAdmin}
        />
    );
}
