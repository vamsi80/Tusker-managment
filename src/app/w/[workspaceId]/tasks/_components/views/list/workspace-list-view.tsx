import { getWorkspaceTasks } from "@/data/task/get-workspace-tasks";
import { TaskTable } from "@/components/task/list/task-table";
import { extractAssigneeOptions } from "@/lib/utils/extract-filter-options";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getUserProjects } from "@/data/project/get-projects";

interface WorkspaceListViewProps {
    workspaceId: string;
}

export async function WorkspaceListView({
    workspaceId,
}: WorkspaceListViewProps) {
    // Fetch data in parallel - REMOVED getAllTasksFlat for performance
    const [tasksData, tagsData, membersData, permissions, projects] = await Promise.all([
        getWorkspaceTasks(workspaceId, {}, 1, 10),
        getWorkspaceTags(workspaceId),
        getWorkspaceMembers(workspaceId),
        getWorkspacePermissions(workspaceId),
        getUserProjects(workspaceId),
    ]);

    const { tasks, hasMore, totalCount } = tasksData;

    // Derived assignees from members instead of fetching all tasks
    const assigneesFromMembers = membersData.workspaceMembers.map(member => ({
        id: member.user?.id || member.userId, // Use user ID for filtering matches task.assignee.id
        name: member.user?.name || '',
        surname: member.user?.surname || undefined,
    }));

    // Map workspace members to the structure expected by components (matching ProjectMembersType)
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

    // Transform workspace tasks to match TaskWithSubTasks format
    const transformedTasks = tasks.map(task => ({
        ...task,
        subTasks: undefined,
        createdBy: task.createdBy || { user: { name: '', surname: '', image: '' } },
        _count: {
            subTasks: task._count.subTasks,
        },
        projectId: task.projectId,
    }));

    const tags = tagsData.map(tag => ({
        id: tag.id,
        name: tag.name,
    }));

    return (
        <TaskTable
            initialTasks={transformedTasks as any}
            initialHasMore={hasMore ?? false}
            initialTotalCount={totalCount}
            members={formattedMembers as any}
            assignees={assigneesFromMembers}
            workspaceId={workspaceId}
            projectId="" // Empty for workspace-level view
            canCreateSubTask={permissions.isWorkspaceAdmin || true} // Allow for members as well if they have access
            showAdvancedFilters={true}
            tags={tags}
            projects={projects.map(p => ({ id: p.id, name: p.name, color: p.color || undefined }))}
            level="workspace"
        />
    );
}
