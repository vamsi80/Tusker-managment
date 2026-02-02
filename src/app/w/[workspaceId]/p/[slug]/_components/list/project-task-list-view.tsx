import { getTasks } from "@/data/task/get-tasks";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { TaskTable } from "@/components/task/list/task-table";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { UserPermissionsType } from "@/data/user/get-user-permissions";
import { TaskWithSubTasks } from "@/components/task/shared/types";

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
    // Fetch parent tasks (List View mode) using unified function
    const { tasks, hasMore } = await getTasks({
        workspaceId,
        projectId,
        view: "list",
        page: 1,
        limit: 50 // Load reasonable initial batch
    });

    // Transform to TaskWithSubTasks structure
    const parentTasks = tasks.map(task => ({
        ...task,
        subTasks: undefined,
        // _count is already included in getTasks result
    })) as TaskWithSubTasks[];

    // Fetch workspace tags for subtask creation/editing
    const tagsData = await getWorkspaceTags(workspaceId);

    // Map tags to only include necessary fields (id, name)
    const tags = tagsData.map(tag => ({
        id: tag.id,
        name: tag.name,
    }));

    return (
        <TaskTable
            initialTasks={parentTasks}
            initialHasMore={hasMore}
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
