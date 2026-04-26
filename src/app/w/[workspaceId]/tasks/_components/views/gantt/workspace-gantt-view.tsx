import { getTasks } from "@/data/task/get-tasks";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { ProjectService } from "@/server/services/project.service";
import dynamic from "next/dynamic";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { requireUser } from "@/lib/auth/require-user";

const WorkspaceGanttClient = dynamic(
    () => import("./workspace-gantt-client").then(mod => mod.WorkspaceGanttClient),
    { loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Gantt Chart...</div> }
);

interface WorkspaceGanttViewProps {
    workspaceId: string;
}

export async function WorkspaceGanttView({ workspaceId }: WorkspaceGanttViewProps) {
    const userPromise = requireUser();
    const membersPromise = ProjectService.getWorkspaceProjectMembers(workspaceId);

    const user = await userPromise;

    const viewStartTime = performance.now();
    const [tasksData, projectMembers, permissions] = await Promise.all([
        getTasks({
            workspaceId,
            hierarchyMode: "parents",
            includeSubTasks: false, // 🚀 ZERO-WEIGHT: Don't load subtasks initially
            limit: 50, // 🔋 Standard limit for initial load
            includeFacets: true,
            view_mode: "gantt"
        }, user.id),
        membersPromise,
        getWorkspacePermissions(workspaceId),
    ]);
    const duration = performance.now() - viewStartTime;
    if (duration > 800) {
        console.warn(`[PERF_WARN] WorkspaceGanttView rendered in ${duration.toFixed(2)}ms`);
    }

    const rawTasks = 'tasks' in tasksData ? tasksData.tasks : [];
    const allTasks: any[] = [...rawTasks]; // Only parent tasks initially

    // console.log("🟦 [GANTT SERVER] allTasks total count:", allTasks.length);

    // Simplified: Role indicators and project metadata are resolved on the client using Layout Memory

    const ganttTasks = transformToGanttTasks(allTasks);

    return (
        <WorkspaceGanttClient
            workspaceId={workspaceId}
            initialTasks={ganttTasks}
            allTasks={allTasks}
            subtaskDataMap={{}}
            members={projectMembers as any}
            projectCounts={(tasksData as any)?.facets?.projects || {}}
            currentUser={{ id: user.id }}
        />
    );
}
