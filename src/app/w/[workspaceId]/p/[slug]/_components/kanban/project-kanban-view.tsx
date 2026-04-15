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
    const permissionsPromise = import("@/data/user/get-user-permissions").then(m => m.getUserPermissions(workspaceId, projectId, user.id));

    const COLUMNS = ["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED", "CANCELLED"] as const;

    const [projectMembers, pmMap, permissions] = await Promise.all([
        membersPromise,
        import("@/data/workspace/get-workspace-kanban-data").then(m => m.getWorkspaceProjectManagersMap(workspaceId)),
        permissionsPromise
    ]);

    // 🚀 ZERO-WEIGHT SHELL: Tasks are no longer fetched server-side.
    // KanbanBoard will fetch its own initial data on the client via Hono.
    const initialData = COLUMNS.reduce((acc, status) => {
        acc[status] = {
            subTasks: [],
            totalCount: 0,
            hasMore: false,
            nextCursor: null,
            currentPage: 1
        };
        return acc;
    }, {} as any);

    return (
        <KanbanBoard
            initialData={initialData}
            projectMembers={projectMembers as any}
            workspaceId={workspaceId}
            projectId={projectId}
            projectManagers={pmMap || {}}
            permissions={permissions}
            userId={user.id}
        />
    );
}
