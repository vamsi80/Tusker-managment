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
            groupBy: "status",
            excludeParents: true, // ONLY FETCH CARDS (NOT PARENTS)
            limit: 100,
            sorts: [{ field: "createdAt", direction: "desc" }]
        }),
        getProjectMembers(projectId),
    ]);

    // Group tasks by status in JS with strict deduplication
    const statusGroups: Record<string, any[]> = {
        TO_DO: [],
        IN_PROGRESS: [],
        CANCELLED: [],
        REVIEW: [],
        HOLD: [],
        COMPLETED: [],
    };

    const idSet = new Set();
    tasksResponse.tasks.forEach((task: any) => {
        // Guard 1: Deduplicate
        if (idSet.has(task.id)) return;
        idSet.add(task.id);

        // Guard 2: Strict Status Grouping
        if (task.status && statusGroups[task.status]) {
            statusGroups[task.status].push(task);
        }
    });

    const counts = (tasksResponse.facets as any).statusCounts || {};

    const initialData = {
        TO_DO: {
            subTasks: statusGroups.TO_DO,
            totalCount: counts.TO_DO || statusGroups.TO_DO.length,
            hasMore: (counts.TO_DO || statusGroups.TO_DO.length) > statusGroups.TO_DO.length,
            nextCursor: statusGroups.TO_DO.length > 0 ? { id: statusGroups.TO_DO[statusGroups.TO_DO.length - 1].id, createdAt: statusGroups.TO_DO[statusGroups.TO_DO.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        IN_PROGRESS: {
            subTasks: statusGroups.IN_PROGRESS,
            totalCount: counts.IN_PROGRESS || statusGroups.IN_PROGRESS.length,
            hasMore: (counts.IN_PROGRESS || statusGroups.IN_PROGRESS.length) > statusGroups.IN_PROGRESS.length,
            nextCursor: statusGroups.IN_PROGRESS.length > 0 ? { id: statusGroups.IN_PROGRESS[statusGroups.IN_PROGRESS.length - 1].id, createdAt: statusGroups.IN_PROGRESS[statusGroups.IN_PROGRESS.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        CANCELLED: {
            subTasks: statusGroups.CANCELLED,
            totalCount: counts.CANCELLED || statusGroups.CANCELLED.length,
            hasMore: (counts.CANCELLED || statusGroups.CANCELLED.length) > statusGroups.CANCELLED.length,
            nextCursor: statusGroups.CANCELLED.length > 0 ? { id: statusGroups.CANCELLED[statusGroups.CANCELLED.length - 1].id, createdAt: statusGroups.CANCELLED[statusGroups.CANCELLED.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        REVIEW: {
            subTasks: statusGroups.REVIEW,
            totalCount: counts.REVIEW || statusGroups.REVIEW.length,
            hasMore: (counts.REVIEW || statusGroups.REVIEW.length) > statusGroups.REVIEW.length,
            nextCursor: statusGroups.REVIEW.length > 0 ? { id: statusGroups.REVIEW[statusGroups.REVIEW.length - 1].id, createdAt: statusGroups.REVIEW[statusGroups.REVIEW.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        HOLD: {
            subTasks: statusGroups.HOLD,
            totalCount: counts.HOLD || statusGroups.HOLD.length,
            hasMore: (counts.HOLD || statusGroups.HOLD.length) > statusGroups.HOLD.length,
            nextCursor: statusGroups.HOLD.length > 0 ? { id: statusGroups.HOLD[statusGroups.HOLD.length - 1].id, createdAt: statusGroups.HOLD[statusGroups.HOLD.length - 1].createdAt } : undefined,
            currentPage: 1
        },
        COMPLETED: {
            subTasks: statusGroups.COMPLETED,
            totalCount: counts.COMPLETED || statusGroups.COMPLETED.length,
            hasMore: (counts.COMPLETED || statusGroups.COMPLETED.length) > statusGroups.COMPLETED.length,
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
