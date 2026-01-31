import { TaskTable } from "@/components/task/list/task-table";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getUserProjects } from "@/data/project/get-projects";
import { requireUser } from "@/lib/auth/require-user";
import { getTasks } from "@/data/task/get-tasks";
import { TaskWithSubTasks } from "@/components/task/shared/types";

interface WorkspaceListViewProps {
    workspaceId: string;
}

export async function WorkspaceListView({
    workspaceId,
}: WorkspaceListViewProps) {
    // Get current user
    const user = await requireUser();

    // Fetch initial tasks and metadata in parallel
    const [tagsData, membersData, permissions, projects, tasksData] = await Promise.all([
        getWorkspaceTags(workspaceId),
        getWorkspaceMembers(workspaceId),
        getWorkspacePermissions(workspaceId),
        getUserProjects(workspaceId),
        getTasks({
            workspaceId,
            view: "list",
            page: 1,
            limit: 20,
            includeFacets: true
        })
    ]);

    // Map workspace members to the structure expected by components
    const formattedMembers = membersData.workspaceMembers.map(member => ({
        workspaceMember: {
            id: member.id,
            workspaceRole: member.workspaceRole as any,
            user: {
                id: member.user?.id || '',
                name: member.user?.name || '',
                surname: member.user?.surname || '',
                image: member.user?.image || '',
            }
        }
    }));

    const tags = tagsData.map(tag => ({
        id: tag.id,
        name: tag.name,
    }));

    const initialTasks = tasksData.tasks.map(t => ({
        ...t,
        subTasks: undefined
    })) as TaskWithSubTasks[];

    return (
        <TaskTable
            initialTasks={initialTasks}
            initialHasMore={tasksData.hasMore}
            initialTotalCount={tasksData.totalCount}
            members={formattedMembers as any}
            workspaceId={workspaceId}
            projectId="" // Empty for workspace-level view
            canCreateSubTask={permissions.hasAccess}
            showAdvancedFilters={true}
            tags={tags}
            projects={projects.map(p => ({ id: p.id, name: p.name, color: p.color || undefined, canManageMembers: p.canManageMembers }))}
            leadProjectIds={permissions.leadProjectIds || []}
            isWorkspaceAdmin={permissions.isWorkspaceAdmin}
            level="workspace"
            userId={user.id}
            projectCounts={tasksData.facets.projects}
        />
    );
}
