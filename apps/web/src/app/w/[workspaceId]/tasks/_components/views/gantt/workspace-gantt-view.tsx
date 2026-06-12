import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { requireUser } from "@/lib/auth/require-user";
import { WorkspaceGanttClient } from "./workspace-gantt-client";
import type { WorkspaceTaskType } from "@/types/task";
import type { ProjectMembersType } from "@/types/project";

interface WorkspaceGanttViewProps {
    workspaceId: string;
}

interface MemberApiItem {
    userId: string;
    projectRole: string;
    workspaceRole?: string;
    user?: { id: string; surname?: string | null; image?: string | null };
}

interface GanttApiData {
    tasks?: WorkspaceTaskType[];
    hasMore?: boolean;
    facets?: { projects?: Record<string, number> };
}

export async function WorkspaceGanttView({ workspaceId }: WorkspaceGanttViewProps) {
    const user = await requireUser();

    const viewStartTime = performance.now();
    const [tasksRes, membersRes] = await Promise.all([
        serverApiFetch<{ success: boolean; data: GanttApiData }>(`/workspaces/${workspaceId}/tasks/gantt?limit=25&facets=true`).catch(() => ({ data: { tasks: [], hasMore: false } })),
        serverApiFetch<{ success: boolean; data: MemberApiItem[] }>(`/projects/project-members?workspaceId=${workspaceId}`).catch(() => ({ data: [] as MemberApiItem[] })),
    ]);
    const duration = performance.now() - viewStartTime;
    if (duration > 800) {
        console.warn(`[PERF_WARN] WorkspaceGanttView rendered in ${duration.toFixed(2)}ms`);
    }

    const tasksData = tasksRes.data;
    const allTasks: WorkspaceTaskType[] = [...(tasksData?.tasks ?? [])];

    const ganttTasks = transformToGanttTasks(allTasks);

    return (
        <WorkspaceGanttClient
            workspaceId={workspaceId}
            initialTasks={ganttTasks}
            allTasks={allTasks}
            subtaskDataMap={{}}
            members={membersRes.data as unknown as ProjectMembersType}
            projectCounts={tasksData?.facets?.projects || {}}
            currentUser={{ id: user.id }}
        />
    );
}
