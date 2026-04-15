import dynamic from "next/dynamic";
import { getTasks } from "@/data/task/get-tasks";
import type { ProjectMembersType } from "@/data/project/get-project-members";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import type { UserPermissionsType } from "@/data/user/get-user-permissions";
import type { TaskWithSubTasks } from "@/components/task/shared/types";

const TaskTable = dynamic(() => import("@/components/task/list/task-table"), {
    loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Tasks...</div>
});

interface ProjectTaskListViewProps {
    workspaceId: string;
    projectId: string;
    members: ProjectMembersType;
    canCreateSubTask: boolean;
    permissions: UserPermissionsType;
    userId: string;
}

/**
 * Server component that fetches initial task data and passes it to the client TaskTable component
 * Uses unified getTasks() function
 */
export async function ProjectTaskListView({
    workspaceId,
    projectId,
    members,
    canCreateSubTask,
    permissions,
    userId,
}: ProjectTaskListViewProps) {
    // 🚀 ZERO-WEIGHT SHELL: Tasks are no longer fetched server-side to minimize response payload.
    // TaskTable will fetch its own initial data on the client via Hono.
    
    // Fetch workspace tags for subtask creation/editing
    const tagsData = await getWorkspaceTags(workspaceId);

    // Map tags to only include necessary fields (id, name)
    const tags = tagsData.map(tag => ({
        id: tag.id,
        name: tag.name,
    }));

    return (
        <TaskTable
            initialTasks={[]}
            initialHasMore={false}
            initialNextCursor={null}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
            canCreateSubTask={canCreateSubTask}
            permissions={permissions}
            userId={userId}
            tags={tags}
        />
    );
}
