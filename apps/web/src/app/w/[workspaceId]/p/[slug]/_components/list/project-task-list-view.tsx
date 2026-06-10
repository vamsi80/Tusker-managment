import dynamic from "next/dynamic";
import { serverApiFetch } from "@/lib/api-client/server-fetch";
import type { TaskWithSubTasks } from "@/components/task/shared/types";

const TaskTable = dynamic(() => import("@/components/task/list/task-table"), {
    loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Tasks...</div>
});

interface ProjectTaskListViewProps {
    workspaceId: string;
    projectId: string;
    userId: string;
}

export async function ProjectTaskListView({
    workspaceId,
    projectId,
    userId,
}: ProjectTaskListViewProps) {
    const [membersRes, permissionsRes, tasksRes] = await Promise.all([
        serverApiFetch<{ success: boolean; data: any[] }>(`/projects/${projectId}/members`).catch(() => ({ data: [] })),
        serverApiFetch<{ success: boolean; data: any }>(`/projects/${projectId}/permissions?workspaceId=${workspaceId}`).catch(() => ({ data: {} })),
        serverApiFetch<{ success: boolean; data: any }>(`/tasks?workspaceId=${workspaceId}&projectId=${projectId}&hm=parents&sub=false&l=25&vm=list`).catch(() => ({ data: { tasks: [], hasMore: false, nextCursor: null } })),
    ]);

    const members = (membersRes.data ?? []).map((m: any) => ({
        userId: m.userId,
        projectRole: m.projectRole,
        workspaceRole: m.workspaceRole,
        user: m.user ? { id: m.user.id, surname: m.user.surname, image: m.user.image } : undefined,
    }));
    const permissions = permissionsRes.data;
    const tasksData = tasksRes.data;

    // Handle union response safely
    const rawTasks = (tasksData as any).tasks || [];

    const initialTasks = rawTasks.map((t: any) => ({
        ...t,
        subtaskCount: t.subtaskCount ?? t._count?.subTasks ?? 0,
        subTasks: undefined // Signaling 'not yet fetched'
    })) as TaskWithSubTasks[];

    return (
        <TaskTable
            initialTasks={initialTasks}
            initialHasMore={tasksData.hasMore}
            initialNextCursor={tasksData.nextCursor}
            initialTotalCount={(tasksData as any).totalCount ?? undefined}
            members={members as any}
            workspaceId={workspaceId}
            projectId={projectId}
            canCreateSubTask={permissions.canCreateSubTask}
            permissions={permissions}
            userId={userId}
            level="project"
        />
    );
}
