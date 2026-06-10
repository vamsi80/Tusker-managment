import dynamic from "next/dynamic";
import { requireUser } from "@/lib/auth/require-user";
import { serverApiFetch } from "@/lib/api-client/server-fetch";

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
    const user = await requireUser();

    const viewStartTime = performance.now();
    const [membersRes, { data: permissions }, tasksRes] = await Promise.all([
        serverApiFetch<{ success: boolean; data: any[] }>(
            `/projects/project-members?workspaceId=${workspaceId}`
        ).catch(() => ({ data: [] })),
        serverApiFetch<{ success: boolean; data: { hasAccess: boolean } }>(
            `/workspaces/${workspaceId}/permissions`
        ).catch(() => ({ data: { hasAccess: false } })),
        serverApiFetch<{ success: boolean; data: any }>(
            `/tasks?workspaceId=${workspaceId}&hm=parents&sub=false&l=25&facets=true&vm=list`
        ).catch(() => ({ data: { tasks: [], hasMore: false, nextCursor: null } })),
    ]);
    const duration = performance.now() - viewStartTime;
    if (duration > 500) {
        console.warn(`[PERF_WARN] WorkspaceListView rendered in ${duration.toFixed(2)}ms`);
    }

    const members = (membersRes.data ?? []).map((m: any) => ({
        userId: m.userId,
        projectRole: m.projectRole,
        workspaceRole: m.workspaceRole,
        user: m.user ? { id: m.user.id, surname: m.user.surname, image: m.user.image } : undefined,
    }));

    const tasksData = tasksRes.data;
    const rawTasks = tasksData?.tasks ?? [];
    const initialTasks = rawTasks.map((t: any) => ({
        ...t,
        subtaskCount: t.subtaskCount ?? t._count?.subTasks ?? 0,
        subTasks: undefined
    })) as TaskWithSubTasks[];

    return (
        <TaskTable
            initialTasks={initialTasks}
            initialHasMore={tasksData?.hasMore ?? false}
            initialNextCursor={tasksData?.nextCursor ?? null}
            initialTotalCount={tasksData?.totalCount ?? undefined}
            members={members as any}
            workspaceId={workspaceId}
            projectId=""
            canCreateSubTask={permissions?.hasAccess ?? false}
            level="workspace"
            userId={user.id}
            projectCounts={tasksData?.facets?.projects || {}}
        />
    );
}
