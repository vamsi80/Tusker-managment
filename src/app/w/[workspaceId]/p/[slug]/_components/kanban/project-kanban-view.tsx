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
    // ONE QUERY: Fetch all tasks for this project across all statuses
    const [tasksResponse, projectMembers] = await Promise.all([
        getTasks({
            workspaceId,
            projectId,
            hierarchyMode: "all",
            groupBy: "status",
            limit: 200, // Reasonable batch per status
            sorts: [{ field: "createdAt", direction: "desc" }]
        }),
        getProjectMembers(projectId),
    ]);

    // Group tasks by status in JS
    const statusGroups: Record<string, any[]> = {
        TO_DO: [],
        IN_PROGRESS: [],
        CANCELLED: [],
        REVIEW: [],
        HOLD: [],
        COMPLETED: [],
    };

    tasksResponse.tasks.forEach((task: any) => {
        if (statusGroups[task.status]) {
            statusGroups[task.status].push(task);
        }
    });

    const limit = 50;
    const initialData = {
        TO_DO: {
            subTasks: statusGroups.TO_DO,
            totalCount: statusGroups.TO_DO.length,
            hasMore: statusGroups.TO_DO.length >= limit,
            nextCursor: statusGroups.TO_DO.length > 0 ? { id: statusGroups.TO_DO[statusGroups.TO_DO.length - 1].id, createdAt: statusGroups.TO_DO[statusGroups.TO_DO.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        IN_PROGRESS: {
            subTasks: statusGroups.IN_PROGRESS,
            totalCount: statusGroups.IN_PROGRESS.length,
            hasMore: statusGroups.IN_PROGRESS.length >= limit,
            nextCursor: statusGroups.IN_PROGRESS.length > 0 ? { id: statusGroups.IN_PROGRESS[statusGroups.IN_PROGRESS.length - 1].id, createdAt: statusGroups.IN_PROGRESS[statusGroups.IN_PROGRESS.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        CANCELLED: {
            subTasks: statusGroups.CANCELLED,
            totalCount: statusGroups.CANCELLED.length,
            hasMore: statusGroups.CANCELLED.length >= limit,
            nextCursor: statusGroups.CANCELLED.length > 0 ? { id: statusGroups.CANCELLED[statusGroups.CANCELLED.length - 1].id, createdAt: statusGroups.CANCELLED[statusGroups.CANCELLED.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        REVIEW: {
            subTasks: statusGroups.REVIEW,
            totalCount: statusGroups.REVIEW.length,
            hasMore: statusGroups.REVIEW.length >= limit,
            nextCursor: statusGroups.REVIEW.length > 0 ? { id: statusGroups.REVIEW[statusGroups.REVIEW.length - 1].id, createdAt: statusGroups.REVIEW[statusGroups.REVIEW.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        HOLD: {
            subTasks: statusGroups.HOLD,
            totalCount: statusGroups.HOLD.length,
            hasMore: statusGroups.HOLD.length >= limit,
            nextCursor: statusGroups.HOLD.length > 0 ? { id: statusGroups.HOLD[statusGroups.HOLD.length - 1].id, createdAt: statusGroups.HOLD[statusGroups.HOLD.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        COMPLETED: {
            subTasks: statusGroups.COMPLETED,
            totalCount: statusGroups.COMPLETED.length,
            hasMore: statusGroups.COMPLETED.length >= limit,
            nextCursor: statusGroups.COMPLETED.length > 0 ? { id: statusGroups.COMPLETED[statusGroups.COMPLETED.length - 1].id, createdAt: statusGroups.COMPLETED[statusGroups.COMPLETED.length - 1].createdAt } : undefined,
            currentPage: 1
        },
    };

    return (
        <KanbanBoard
            initialData={initialData}
            projectMembers={projectMembers}
            workspaceId={workspaceId}
            projectId={projectId}
        />
    );
}
