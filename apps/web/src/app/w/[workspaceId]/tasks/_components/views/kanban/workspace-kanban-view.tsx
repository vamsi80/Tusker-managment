import { requireUser } from "@/lib/auth/require-user";
import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { KanbanBoard } from "@/components/task/kanban/kanban-board";

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
        kanbanRes,
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
        serverApiFetch<{ success: boolean; data: any }>(
            `/workspaces/${workspaceId}/tasks/kanban?limit=10&facets=true&fields=description`
        ).catch(() => ({ data: null })),
    ]);
    const duration = performance.now() - viewStartTime;

    if (duration > 600) {
        console.warn(`[PERF_WARN] WorkspaceKanbanView rendered in ${duration.toFixed(2)}ms`);
    }

    // Transform API response into the per-column shape KanbanBoard hydrates from
    const kanbanData = kanbanRes.data;
    const initialData = kanbanData?.tasksByStatus
        ? Object.fromEntries(
            Object.entries(kanbanData.tasksByStatus).map(([status, col]: [string, any]) => [
                status,
                {
                    tasks: col.tasks || [],
                    totalCount: kanbanData.facets?.status?.[status] ?? col.tasks?.length ?? 0,
                    hasMore: col.hasMore ?? false,
                    nextCursor: col.nextCursor ?? null,
                },
            ])
        )
        : null;

    return (
        <KanbanBoard
            initialData={initialData as any}
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
