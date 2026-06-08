import { serverApiFetch } from "@/lib/api-client/server-fetch";
import dynamic from "next/dynamic";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { requireUser } from "@/lib/auth/require-user";

const WorkspaceGanttClient = dynamic(
    () => import("./workspace-gantt-client").then(mod => mod.WorkspaceGanttClient),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Gantt Chart...</div> }
);

interface WorkspaceGanttViewProps {
    workspaceId: string;
}

export async function WorkspaceGanttView({ workspaceId }: WorkspaceGanttViewProps) {
    const user = await requireUser();

    const viewStartTime = performance.now();
    const [tasksRes, membersRes] = await Promise.all([
        serverApiFetch<{ success: boolean; data: any }>(`/tasks?workspaceId=${workspaceId}&hm=parents&sub=false&l=25&facets=true&vm=gantt`).catch(() => ({ data: { tasks: [], hasMore: false } })),
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
