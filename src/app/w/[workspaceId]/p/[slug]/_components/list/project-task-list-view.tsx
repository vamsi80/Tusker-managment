import dynamic from "next/dynamic";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { ProjectService } from "@/server/services/project.service";
import { requireUser } from "@/lib/auth/require-user";
import { getTasks } from "@/data/task/get-tasks";
import type { TaskWithSubTasks } from "@/components/task/shared/types";

const TaskTable = dynamic(() => import("@/components/task/list/task-table"), {
    loading: () => <div className="h-[60vh] w-full flex items-center justify-center text-muted-foreground animate-pulse">Loading Tasks...</div>
});

interface ProjectTaskListViewProps {
    workspaceId: string;
    projectId: string;
    userId: string;
}

/**
 * ProjectTaskListView (Server Component)
 * Hydrates initial tasks, members, and permissions on the server for sub-second 
 * interaction and consistent infinite scroll behavior.
 */
export async function ProjectTaskListView({
    workspaceId,
    projectId,
}: ProjectTaskListViewProps) {
    // 1. Get current user (server-side authentication)
    const user = await requireUser();

    // 2. Fetch initial data in parallel for speed
    const [tagsData, members, permissions, tasksData] = await Promise.all([
        getWorkspaceTags(workspaceId),
        ProjectService.getMembers(projectId),
        ProjectService.getPermissions(workspaceId, projectId, user.id),
        getTasks({
            workspaceId,
            projectId,
            hierarchyMode: "parents",
            includeSubTasks: false,
            page: 1,
            limit: 50,
            view_mode: "list"
        }, user.id)
    ]);

    const tags = tagsData.map(tag => ({
        id: tag.id,
        name: tag.name,
    }));

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
            userId={user.id}
            level="project"
            tags={tags}
        />
    );
}
