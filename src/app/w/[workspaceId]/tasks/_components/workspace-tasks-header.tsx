import { getWorkspaceTaskCreationData } from "@/data/workspace/get-workspace-task-creation-data";
import { WorkspaceTasksHeaderClient } from "./workspace-tasks-header-client";

interface WorkspaceTasksHeaderProps {
    workspaceId: string;
}

/**
 * Workspace Tasks Header (Server Component)
 * 
 * Fetches optimized data and passes to client component
 */
export async function WorkspaceTasksHeader({ workspaceId }: WorkspaceTasksHeaderProps) {
    // Fetch all data with optimized caching and permission filtering
    const data = await getWorkspaceTaskCreationData(workspaceId);

    return (
        <WorkspaceTasksHeaderClient
            workspaceId={workspaceId}
            projects={data.projects}
            members={data.members as any}
            tags={data.tags}
            parentTasks={data.parentTasks}
            permissions={data.permissions}
        />
    );
}
