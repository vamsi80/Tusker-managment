import { getUserProjects } from "@/data/project/get-projects";
import { isAdminServer } from "@/lib/auth/requireAdmin";
import { NavProjects } from "./nav-projects";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";

interface NavProjectsAsyncProps {
    workspaceId: string;
}

/**
 * Server component that fetches sidebar-specific data for projects
 * Uses optimized caching backed by unstable_cache
 */
export async function NavProjectsAsync({ workspaceId }: NavProjectsAsyncProps) {
    try {
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
    } catch (error) {
        console.error("Error loading sidebar projects:", error);
        return null; // Don't crash the sidebar if projects fail to load
    }
}
