import { getUserProjects } from "@/app/data/user/get-user-projects";
import { getWorkspaceMembers } from "@/app/data/workspace/get-workspace-members";
import { isAdminServer } from "@/app/data/workspace/requireAdmin";
import { NavProjects } from "./nav-projects";

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
