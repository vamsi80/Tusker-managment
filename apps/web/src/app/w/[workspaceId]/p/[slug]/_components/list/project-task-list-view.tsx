import { serverApiFetch } from "@/lib/api-client/server-fetch";
import TaskTable from "@/components/task/list/task-table";
import type { TaskWithSubTasks } from "@/components/task/shared/types";
import type { ProjectMembersType } from "@/types/project";

interface MemberApiItem {
    userId: string;
    projectRole: string;
    workspaceRole?: string;
    id?: string;
    projectMemberId?: string;
    user?: { id: string; surname: string | null; image?: string | null };
}

interface TaskListData {
    tasks?: TaskWithSubTasks[];
    hasMore?: boolean;
    nextCursor?: string | null;
    totalCount?: number;
}

interface PermissionsData {
    canCreateSubTask?: boolean;
    [key: string]: unknown;
}

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
        serverApiFetch<{ success: boolean; data: MemberApiItem[] }>(`/projects/${projectId}/members`).catch(() => ({ data: [] as MemberApiItem[] })),
        serverApiFetch<{ success: boolean; data: PermissionsData }>(`/projects/${projectId}/permissions?workspaceId=${workspaceId}`).catch(() => ({ data: {} as PermissionsData })),
        serverApiFetch<{ success: boolean; data: TaskListData }>(`/workspaces/${workspaceId}/projects/${projectId}/tasks/list?limit=25`).catch(() => ({ data: { tasks: [], hasMore: false, nextCursor: null } as TaskListData })),
    ]);

    const members = (membersRes.data ?? []).map((m) => ({
        userId: m.userId,
        projectRole: m.projectRole,
        workspaceRole: m.workspaceRole,
        user: m.user ? { id: m.user.id, surname: m.user.surname, image: m.user.image } : undefined,
    })) as unknown as ProjectMembersType;
    const permissions = permissionsRes.data;
    const tasksData = tasksRes.data;

    // Handle union response safely
    const rawTasks = tasksData?.tasks || [];

    const initialTasks = rawTasks.map((t) => ({
        ...t,
        subtaskCount: (t as TaskWithSubTasks & { _count?: { subTasks?: number } }).subtaskCount ?? (t as TaskWithSubTasks & { _count?: { subTasks?: number } })._count?.subTasks ?? 0,
        subTasks: undefined // Signaling 'not yet fetched'
    })) as TaskWithSubTasks[];

    return (
        <TaskTable
            initialTasks={initialTasks}
            initialHasMore={tasksData?.hasMore ?? false}
            initialNextCursor={tasksData?.nextCursor ?? null}
            initialTotalCount={tasksData?.totalCount ?? undefined}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
            canCreateSubTask={permissions.canCreateSubTask ?? false}
            permissions={permissions as unknown as import("@/types/workspace").UserPermissionsType}
            userId={userId}
            level="project"
        />
    );
}
