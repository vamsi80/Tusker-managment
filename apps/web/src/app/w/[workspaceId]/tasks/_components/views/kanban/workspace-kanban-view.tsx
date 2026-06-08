import { requireUser } from "@/lib/auth/require-user";
import dynamic from "next/dynamic";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

const KanbanBoard = dynamic(
    () => import("@/components/task/kanban/kanban-board").then(mod => mod.KanbanBoard),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Board...</div> }
);

interface WorkspaceKanbanViewProps {
    workspaceId: string;
}

export default async function WorkspaceKanbanView({ workspaceId }: WorkspaceKanbanViewProps) {
    const user = await requireUser();

    const viewStartTime = performance.now();
    const [
        { data: permissions },
        membersRes,
        assignmentMapsRes,
    ] = await Promise.all([
        serverApiFetch<{ success: boolean; data: any }>(
            `/workspaces/${workspaceId}/permissions`
        ).catch(() => ({ data: {} })),
        serverApiFetch<{ success: boolean; data: any[] }>(
            `/projects/project-members?workspaceId=${workspaceId}`
        ).catch(() => ({ data: [] })),
        serverApiFetch<{ success: boolean; data: { projectAssignments: any[]; projectLeaders: any[] } }>(
            `/projects/assignment-maps?workspaceId=${workspaceId}`
        ).catch(() => ({ data: { projectAssignments: [], projectLeaders: [] } })),
    ]);
    const duration = performance.now() - viewStartTime;

    if (duration > 600) {
        console.warn(`[PERF_WARN] WorkspaceKanbanView rendered in ${duration.toFixed(2)}ms`);
    }

    return (
        <KanbanBoard
            initialData={null as any}
            isShell={true}
            projectMembers={membersRes.data as any}
            workspaceId={workspaceId}
            projectId=""
            level="workspace"
            projectManagers={assignmentMapsRes.data.projectLeaders}
            permissions={permissions}
            userId={user.id}
        />
    );
}
