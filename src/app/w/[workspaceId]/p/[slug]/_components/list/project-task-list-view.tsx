import { getAllTasksFlat } from "@/data/task";
import { ProjectMembersType } from "@/data/project/get-project-members";
import { TaskTable } from "@/components/task/list/task-table";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { UserPermissionsType } from "@/data/user/get-user-permissions";

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
 * Uses getAllTasksFlat() - same data source as Gantt chart for consistency
 * - Fetches both parent tasks and subtasks as a flat list
 * - Transforms flat list into hierarchical structure for TaskTable
 * - Role-based filtering (ADMINs/LEADs see all, MEMBERs see only assigned)
 */
export async function ProjectTaskListView({
    workspaceId,
    projectId,
    members,
    canCreateSubTask,
    permissions,
    userId,
}: ProjectTaskListViewProps) {
    // Fetch all tasks (flat) - same data source as Gantt chart
    const { tasks: allTasksFlat } = await getAllTasksFlat(workspaceId, projectId);

    // Transform flat list into hierarchical structure
    // Group subtasks under their parent tasks
    const taskMap = new Map();
    const parentTasks: any[] = [];

    allTasksFlat.forEach(task => {
        if (task.parentTaskId === null) {
            // This is a parent task
            const parentTask = {
                ...task,
                subTasks: undefined, // Will be loaded on-demand
                createdBy: { user: { name: '', surname: '', image: '' } },
                _count: {
                    subTasks: task._count.subTasks,
                },
            };
            taskMap.set(task.id, parentTask);
            parentTasks.push(parentTask);
        }
    });


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
            initialHasMore={false} // All tasks loaded from flat list
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
