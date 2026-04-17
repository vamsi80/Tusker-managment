import dynamic from "next/dynamic";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getProjectMembers } from "@/data/project/get-project-members";
import { getUserPermissions } from "@/data/user/get-user-permissions";
import { requireUser } from "@/lib/auth/require-user";
import { getTasks } from "@/data/task/get-tasks";
import type { TaskWithSubTasks } from "@/components/task/shared/types";
import { AppLoader } from "@/components/shared/app-loader";

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
    userId: propUserId,
}: ProjectTaskListViewProps) {
    // 1. Get current user (server-side authentication)
    const user = await requireUser();
    
    // 2. Fetch initial data in parallel for speed
    const [tagsData, members, permissions, tasksData] = await Promise.all([
        getWorkspaceTags(workspaceId),
        getProjectMembers({ workspaceId, projectId }),
        getUserPermissions(workspaceId, projectId, user.id),
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

    const initialTasks = (tasksData.tasks || []).map(t => ({
        ...t,
        subTasks: (t as any).subTasks
    })) as TaskWithSubTasks[];

    return (
        <TaskTable
            initialTasks={initialTasks}
            initialHasMore={tasksData.hasMore}
            initialNextCursor={tasksData.nextCursor}
            initialTotalCount={tasksData.totalCount ?? undefined}
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
