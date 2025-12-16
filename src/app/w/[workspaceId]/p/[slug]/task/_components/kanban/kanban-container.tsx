import { getAllSubTasks } from "@/data/task";
import { getProjectMembers } from "@/data/project/get-project-members";
import { KanbanBoard } from "./kanban-board";

interface KanbanContainerProps {
    workspaceId: string;
    projectId: string;
}

export async function KanbanContainer({ workspaceId, projectId }: KanbanContainerProps) {
    const [subTasksData, projectMembers] = await Promise.all([
        getAllSubTasks(projectId, workspaceId),
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
