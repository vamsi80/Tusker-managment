import { getTasks } from "@/data/task/get-tasks";
import { requireUser } from "@/lib/auth/require-user";
import { getProjectMembers } from "@/data/project/get-project-members";
import dynamic from "next/dynamic";

const KanbanBoard = dynamic(
    () => import("@/components/task/kanban/kanban-board").then(mod => mod.KanbanBoard),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Kanban...</div> }
);

interface ProjectKanbanViewProps {
    workspaceId: string;
    projectId: string;
}

export async function ProjectKanbanView({
    workspaceId,
    projectId
}: ProjectKanbanViewProps) {
    const userPromise = requireUser();
    const membersPromise = getProjectMembers(projectId);

    const user = await userPromise;

    const COLUMNS = ["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED", "CANCELLED"] as const;

    // Fetch initial page (15 tasks) for EACH status in parallel for better debuggability and UX
    const [statusResponses, projectMembers] = await Promise.all([
        Promise.all(COLUMNS.map(status =>
            getTasks({
                workspaceId,
                projectId,
                status: [status],
                excludeParents: true,
                limit: 30, // Increased to 30 to better fill initial screen and prevent eager paging
                sorts: [{ field: "createdAt", direction: "desc" }],
                view_mode: "kanban",
                includeFacets: true
            }, user.id)
        )),
        membersPromise,
    ]);

    // Construct the group mapping from parallel responses
    const initialData: Record<string, any> = {};

    COLUMNS.forEach((status, index) => {
        const response = statusResponses[index];
        const tasks = response.tasks;
        const totalInDb = response.facets?.statusCounts?.[status] || tasks.length;

        initialData[status] = {
            subTasks: tasks,
            totalCount: totalInDb,
            hasMore: totalInDb > tasks.length,
            nextCursor: totalInDb > tasks.length && tasks.length > 0
                ? { id: tasks[tasks.length - 1].id, createdAt: tasks[tasks.length - 1].createdAt }
                : null,
            currentPage: 1
        };
    });

    return (
        <KanbanBoard
            initialData={initialData}
            projectMembers={projectMembers}
            workspaceId={workspaceId}
            projectId={projectId}
        // projectManagers={projectManagersMap}
        />
    );
}
