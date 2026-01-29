import { getAllTasksFlat } from "@/data/task";
import { TaskTable } from "@/components/task/list/task-table";
import { extractAssigneeOptions } from "@/lib/utils/extract-filter-options";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getUserProjects } from "@/data/project/get-projects";
import { requireUser } from "@/lib/auth/require-user";

interface WorkspaceListViewProps {
    workspaceId: string;
}

export async function WorkspaceListView({
    workspaceId,
}: WorkspaceListViewProps) {
    // Get current user
    const user = await requireUser();

    // Fetch data in parallel - using getAllTasksFlat for consistency with Gantt
    const [allTasksFlat, tagsData, membersData, permissions, projects] = await Promise.all([
        getAllTasksFlat(workspaceId), // Same data source as Gantt chart
        getWorkspaceTags(workspaceId),
        getWorkspaceMembers(workspaceId),
        getWorkspacePermissions(workspaceId),
        getUserProjects(workspaceId),
    ]);

    // Transform flat list into hierarchical structure
    // Group subtasks under their parent tasks
    const taskMap = new Map();
    const parentTasks: any[] = [];

    allTasksFlat.tasks.forEach(task => {
        if (task.parentTaskId === null) {
            // This is a parent task
            const parentTask = {
                ...task,
                subTasks: undefined, // Will be loaded on-demand
                createdBy: { user: { name: '', surname: '', image: '' } },
                _count: {
                    subTasks: task._count.subTasks,
                },
            };
            taskMap.set(task.id, parentTask);
            parentTasks.push(parentTask);
        }
    });

    // Extract assignees from all tasks (including subtasks)
    const assigneesFromTasks = extractAssigneeOptions(allTasksFlat.tasks);

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

    const tags = tagsData.map(tag => ({
        id: tag.id,
        name: tag.name,
    }));

    return (
        <TaskTable
            initialTasks={parentTasks as any}
            initialHasMore={false} // All tasks loaded from flat list
            members={formattedMembers as any}
            assignees={assigneesFromTasks}
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
        />
    );
}
