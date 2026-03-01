import { getUserProjects } from "@/data/project/get-projects";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { NavProjects } from "./nav-projects";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { requireUser } from "@/lib/auth/require-user";

interface NavProjectsAsyncProps {
    workspaceId: string;
}

export async function NavProjectsAsync({ workspaceId }: NavProjectsAsyncProps) {
    // 1. Await User Validation (Fast, 5-10ms)
    const user = await requireUser();

    // 2. Fetch parallel data directly (Suspense handles resolving UI)
    const [projectsData, membersData, permissionsData] = await Promise.all([
        getUserProjects(workspaceId),
        getWorkspaceMembers(workspaceId),
        getWorkspacePermissions(workspaceId),
    ]);

    if (!projectsData || !membersData?.workspaceMembers) {
        return null;
    }

    return (
        <NavProjects
            projects={projectsData}
            workspaceId={workspaceId}
            members={membersData.workspaceMembers}
            isAdmin={permissionsData.isWorkspaceAdmin}
            canCreateProject={permissionsData.canCreateProject}
            userRole={permissionsData.workspaceMember?.workspaceRole}
            currentUserId={user.id}
        />
    );
}
