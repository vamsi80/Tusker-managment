import { getWorkspaceTasks } from "@/data/task";
import { getSubTasksByParentIds } from "@/data/task/get-subtasks-batch";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { ProjectGanttClient } from "./project-gantt-client";
import { requireUser } from "@/lib/auth/require-user";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import prisma from "@/lib/db";

interface GanttServerWrapperProps {
    workspaceId: string;
    projectId: string;
}

/**
 * Server component that fetches Gantt data
 * Uses unified getTasks for parent tasks and then fetches subtasks
 */
export async function GanttServerWrapper({ workspaceId, projectId }: GanttServerWrapperProps) {
    // 1. Fetch Parent Tasks (Unified Function)
    const tasksData = await getWorkspaceTasks({
        workspaceId,
        projectId,
        hierarchyMode: "parents",
        page: 1,
        limit: 5000,
        includeFacets: true
    });

    const parentTasks = tasksData.tasks;
    const parentIds = parentTasks.map(t => t.id);

    // 2. Fetch Subtasks for these parents
    const subtaskResults = await getSubTasksByParentIds(
        parentIds,
        workspaceId,
        projectId, // Project scope
        {},
        100 // Limit subtasks per parent
    );

    const subtasks = subtaskResults.flatMap(r => r.subTasks);
    const allTasks = [...parentTasks, ...subtasks];

    // 3. Create record for subtask data (plain object for server→client serialization)
    const subtaskDataMap: Record<string, any> = {};
    allTasks.forEach(task => {
        if (task.parentTaskId) { // If it's a subtask
            subtaskDataMap[task.id] = task;
        }
    });

    const [user, permissions, projectMembers, tags] = await Promise.all([
        requireUser(),
        getWorkspacePermissions(workspaceId),
        prisma.projectMember.findMany({
            where: { projectId },
            select: {
                workspaceMember: { select: { userId: true, user: true } },
                projectRole: true
            }
        }),
        getWorkspaceTags(workspaceId)
    ]);

    // 4. Enrich tasks with assignee roles & build member options
    const roleMap: Record<string, string> = {};
    const memberOptions = projectMembers.map((pm: any) => {
        roleMap[pm.workspaceMember.userId] = pm.projectRole;
        return {
            id: pm.workspaceMember.userId,
            name: pm.workspaceMember.user?.name || '',
            surname: pm.workspaceMember.user?.surname || undefined,
            email: pm.workspaceMember.user?.email || undefined
        };
    });

    allTasks.forEach(t => {
        if (t.assigneeTo) {
            t.projectRole = roleMap[t.assigneeTo];
        }
    });

    // 5. Transform to Gantt Structure
    const ganttTasks = transformToGanttTasks(allTasks);

    // 6. Get Project Counts
    const projectCounts = tasksData.facets.projects;

    const tagOptions = tags.map(t => ({ id: t.id, name: t.name }));

    return (
        <ProjectGanttClient
            workspaceId={workspaceId}
            projectId={projectId}
            initialTasks={ganttTasks}
            allTasks={allTasks}
            subtaskDataMap={subtaskDataMap}
            members={memberOptions}
            tags={tagOptions}
            projectCounts={projectCounts}
            currentUser={{ id: user.id }}
            permissions={{
                isWorkspaceAdmin: permissions.isWorkspaceAdmin,
                leadProjectIds: permissions.leadProjectIds || [],
                managedProjectIds: permissions.managedProjectIds || []
            }}
        />
    );
}
