import { serverApiFetch } from "@/lib/api-client/server-fetch";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { requireUser } from "@/lib/auth/require-user";
import { WorkspaceGanttClient } from "./workspace-gantt-client";

interface WorkspaceGanttViewProps {
    workspaceId: string;
}

export async function WorkspaceGanttView({ workspaceId }: WorkspaceGanttViewProps) {
    const user = await requireUser();

    const viewStartTime = performance.now();
    const [tasksRes, membersRes] = await Promise.all([
        serverApiFetch<{ success: boolean; data: any }>(`/workspaces/${workspaceId}/tasks/gantt?limit=25&facets=true`).catch(() => ({ data: { tasks: [], hasMore: false } })),
        serverApiFetch<{ success: boolean; data: any[] }>(`/projects/project-members?workspaceId=${workspaceId}`).catch(() => ({ data: [] })),
    ]);
    const duration = performance.now() - viewStartTime;
    if (duration > 800) {
        console.warn(`[PERF_WARN] WorkspaceGanttView rendered in ${duration.toFixed(2)}ms`);
    }

    const tasksData = tasksRes.data;
    const projectMembers = membersRes.data;

    const rawTasks = tasksData?.tasks ?? [];
    const allTasks: any[] = [...rawTasks];

    const ganttTasks = transformToGanttTasks(allTasks);

    return (
        <WorkspaceGanttClient
            workspaceId={workspaceId}
            initialTasks={ganttTasks}
            allTasks={allTasks}
            subtaskDataMap={{}}
            members={projectMembers as any}
            projectCounts={tasksData?.facets?.projects || {}}
            currentUser={{ id: user.id }}
        />
    );
}
