import { requireUser } from "@/lib/auth/require-user";
import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { KanbanBoard } from "@/components/task/kanban/kanban-board";
import type { TaskStatus, SubTasksByStatusResponse, KanbanSubTaskType } from "@/types/task";
import type { ProjectMembersType } from "@/types/project";

interface WorkspaceKanbanViewProps {
    workspaceId: string;
}

interface MemberApiItem {
    userId: string;
    projectRole: string;
    workspaceRole?: string;
    user?: { id: string; surname?: string | null; image?: string | null };
}

interface ProjectLeaderItem {
    id: string;
    [key: string]: unknown;
}

interface KanbanColRaw {
    tasks?: KanbanSubTaskType[];
    hasMore?: boolean;
    nextCursor?: string | null;
}

interface KanbanApiData {
    tasksByStatus?: Record<string, KanbanColRaw>;
    facets?: { status?: Record<string, number> };
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
        serverApiFetch<{ success: boolean; data: Record<string, unknown> }>(
            `/workspaces/${workspaceId}/permissions`
        ).catch(() => ({ data: {} as Record<string, unknown> })),
        serverApiFetch<{ success: boolean; data: MemberApiItem[] }>(
            `/projects/project-members?workspaceId=${workspaceId}`
        ).catch(() => ({ data: [] as MemberApiItem[] })),
        serverApiFetch<{ success: boolean; data: { projectAssignments: ProjectLeaderItem[]; projectLeaders: ProjectLeaderItem[] } }>(
            `/projects/assignment-maps?workspaceId=${workspaceId}`
        ).catch(() => ({ data: { projectAssignments: [], projectLeaders: [] } })),
        serverApiFetch<{ success: boolean; data: KanbanApiData | null }>(
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
            Object.entries(kanbanData.tasksByStatus).map(([status, col]) => [
                status,
                {
                    subTasks: col.tasks || [],
                    totalCount: kanbanData.facets?.status?.[status] ?? col.tasks?.length ?? 0,
                    hasMore: col.hasMore ?? false,
                    nextCursor: col.nextCursor ?? null,
                    currentPage: 0,
                } satisfies SubTasksByStatusResponse,
            ])
        ) as Record<TaskStatus, SubTasksByStatusResponse>
        : null;

    return (
        <KanbanBoard
            initialData={initialData}
            isShell={true}
            projectMembers={membersRes.data as unknown as ProjectMembersType}
            workspaceId={workspaceId}
            projectId=""
            level="workspace"
            projectManagers={assignmentMapsRes.data.projectLeaders as unknown as Record<string, never[]>}
            permissions={permissions}
            userId={user.id}
        />
    );
}
