import dynamic from "next/dynamic";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { ProjectService } from "@/server/services/project.service";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { requireUser } from "@/lib/auth/require-user";
import { getTasks } from "@/data/task/get-tasks";
import type { TaskWithSubTasks } from "@/components/task/shared/types";


const TaskTable = dynamic(() => import("@/components/task/list/task-table"), {
    loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Tasks...</div>
});

interface WorkspaceListViewProps {
    workspaceId: string;
}

export async function WorkspaceListView({
    workspaceId,
}: WorkspaceListViewProps) {
    // Get current user
    const user = await requireUser();

    // Fetch initial tasks and metadata in parallel
    const viewStartTime = performance.now();
    const [projectMembers, permissions, tasksData] = await Promise.all([
        ProjectService.getWorkspaceProjectMembers(workspaceId),
        getWorkspacePermissions(workspaceId),
        getTasks({
            workspaceId,
            hierarchyMode: "parents",
            includeSubTasks: false,
            page: 1,
            limit: 50, // Increased limit for better initial view
            includeFacets: true,
            view_mode: "list"
        }, user.id),
    ]);
    const duration = performance.now() - viewStartTime;
    if (duration > 500) {
        console.warn(`[PERF_WARN] WorkspaceListView rendered in ${duration.toFixed(2)}ms`);
    }

    const formattedMembers = projectMembers;

    // Handle union response safely
    const rawTasks = (tasksData as any).tasks || [];

    const initialTasks = rawTasks.map((t: any) => ({
        ...t,
        subtaskCount: t.subtaskCount ?? t._count?.subTasks ?? 0,
        subTasks: undefined
    })) as TaskWithSubTasks[];

    return (
        <TaskTable
            initialTasks={initialTasks}
            initialHasMore={tasksData.hasMore}
            initialNextCursor={tasksData.nextCursor}
            initialTotalCount={tasksData.totalCount ?? undefined}
            members={formattedMembers as any}
            workspaceId={workspaceId}
            projectId=""
            canCreateSubTask={permissions.hasAccess}
            level="workspace"
            userId={user.id}
            projectCounts={tasksData.facets?.projects || {}}
        />
    );
}
