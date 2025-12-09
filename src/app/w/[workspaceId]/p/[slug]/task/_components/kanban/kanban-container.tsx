import { getAllProjectSubTasks } from "@/app/data/task/get-project-tasks";
import { getProjectMembers } from "@/app/data/project/get-project-members";
import { KanbanBoard } from "./kanban-board";

interface KanbanContainerProps {
    workspaceId: string;
    projectId: string;
}

export async function KanbanContainer({ workspaceId, projectId }: KanbanContainerProps) {
    // Fetch all subtasks and project members for filtering
    const [subTasksData, projectMembers] = await Promise.all([
        getAllProjectSubTasks(projectId, workspaceId),
        getProjectMembers(projectId),
    ]);

    return (
        <div className="space-y-4">
            <KanbanBoard
                initialSubTasks={subTasksData.subTasks}
                projectMembers={projectMembers}
                workspaceId={workspaceId}
                projectId={projectId}
            />
        </div>
    );
}
