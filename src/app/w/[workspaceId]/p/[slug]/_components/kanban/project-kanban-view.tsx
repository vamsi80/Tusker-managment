import { getTasks } from "@/data/task/get-tasks";
import { getProjectMembers } from "@/data/project/get-project-members";
import { KanbanBoard } from "@/components/task/kanban/kanban-board";

interface ProjectKanbanViewProps {
    workspaceId: string;
    projectId: string;
}

export async function ProjectKanbanView({
    workspaceId,
    projectId
}: ProjectKanbanViewProps) {
    // Fetch first page (5 cards) for each status column in parallel
    // Using unified getTasks function
    const fetchColumn = async (status: string) => {
        const res = await getTasks({
            workspaceId,
            projectId,
            view: "kanban",
            status,
            page: 1,
            limit: 5
        });

        // Adapt response to match component expectation
        return {
            subTasks: res.tasks,
            totalCount: res.totalCount,
            hasMore: res.hasMore,
            currentPage: 1
        };
    };

    const [
        todoData,
        inProgressData,
        cancelledData,
        reviewData,
        holdData,
        completedData,
        projectMembers
    ] = await Promise.all([
        fetchColumn("TO_DO"),
        fetchColumn("IN_PROGRESS"),
        fetchColumn("CANCELLED"),
        fetchColumn("REVIEW"),
        fetchColumn("HOLD"),
        fetchColumn("COMPLETED"),
        getProjectMembers(projectId),
    ]);

    // Combine all initial data
    const initialData = {
        TO_DO: todoData,
        IN_PROGRESS: inProgressData,
        CANCELLED: cancelledData,
        REVIEW: reviewData,
        HOLD: holdData,
        COMPLETED: completedData,
    };

    return (
        <KanbanBoard
            initialData={initialData as any} // Cast to satisfy legacy types
            projectMembers={projectMembers}
            workspaceId={workspaceId}
            projectId={projectId}
        />
    );
}
