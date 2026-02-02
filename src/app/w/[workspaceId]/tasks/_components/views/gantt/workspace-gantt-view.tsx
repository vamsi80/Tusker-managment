import prisma from "@/lib/db";
import { getWorkspaceTasks } from "@/data/task";
import { getWorkspaceTags } from "@/data/tag/get-tags";
import { getUserProjects } from "@/data/project/get-projects";
import { WorkspaceGanttClient } from "./workspace-gantt-client";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import { getSubTasksByParentIds } from "@/data/task/list/get-subtasks-batch";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";

interface WorkspaceGanttViewProps {
    workspaceId: string;
}

/**
 * Workspace Gantt View Server Component
 * 
 * Shows all tasks from all accessible projects in Gantt chart format
 * Uses permission-based filtering:
 * - ADMIN/OWNER: See all tasks from all projects
 * - MEMBER: See only tasks from assigned projects and their assigned subtasks
 */
export async function WorkspaceGanttView({ workspaceId }: WorkspaceGanttViewProps) {
    const [tasksData, projects, workspaceMembers, projectMemberMatches, tags] = await Promise.all([
        getWorkspaceTasks({ workspaceId, page: 1, limit: 50, includeFacets: true }), // Get up to 5000 parent tasks
        getUserProjects(workspaceId),
        getWorkspaceMembers(workspaceId),
        prisma.projectMember.findMany({
            where: { project: { workspaceId } },
            select: {
                projectId: true,
                workspaceMember: {
                    select: { userId: true }
                }
            }
        }),
        getWorkspaceTags(workspaceId)
    ]);

    // Fetch subtasks for the parent tasks
    const parentTasksList = tasksData.tasks;
    const parentIds = parentTasksList.map(t => t.id);

    const subtaskResults = await getSubTasksByParentIds(
        parentIds,
        workspaceId,
        undefined, // No project filter
        {}, // No specific filters
        100 // up to 100 subtasks per parent
    );

    const subtasks = subtaskResults.flatMap(r => r.subTasks);
    const allTasks = [...parentTasksList, ...subtasks];

    // Separate parent tasks and subtasks
    // Note: getWorkspaceTasks returns parents, so we can use parentTasksList directly, 
    // but for consistency with original structure we filter from allTasks if needed, 
    // or just rely on parentTaskId property.

    const parentTasks = allTasks.filter(task => !task.parentTaskId);

    // Fix: Explicitly type the map to avoid 'never' inference
    const subtasksMap = new Map<string, any[]>();

    allTasks.forEach(task => {
        if (task.parentTaskId) {
            if (!subtasksMap.has(task.parentTaskId)) {
                subtasksMap.set(task.parentTaskId, []);
            }
            subtasksMap.get(task.parentTaskId)!.push(task);
        }
    });

    // Sort parent tasks by position
    const sortedParentTasks = [...parentTasks].sort((a, b) => {
        const posA = a.position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.position ?? Number.MAX_SAFE_INTEGER;
        return posA - posB;
    });

    // Create a map of subtask ID to full subtask data for the details sheet
    const subtaskDataMap = new Map();
    allTasks.forEach(task => {
        if (task.parentTaskId) {
            subtaskDataMap.set(task.id, task);
        }
    });

    // Build map of project -> userIds
    const projectUserMap: Record<string, string[]> = {};
    projectMemberMatches.forEach(pm => {
        if (!projectUserMap[pm.projectId]) projectUserMap[pm.projectId] = [];
        projectUserMap[pm.projectId].push(pm.workspaceMember.userId);
    });

    // Format options
    const projectOptions = projects.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        color: p.color || undefined,
        memberIds: projectUserMap[p.id] || []
    }));

    const memberOptions = workspaceMembers.workspaceMembers.map(m => ({
        id: m.userId,
        name: m.user?.name || '',
        surname: m.user?.surname || undefined,
        email: m.user?.email || undefined
    }));

    const tagOptions = tags.map(t => ({
        id: t.id,
        name: t.name
    }));

    // Transform data to GanttTask format
    const ganttTasks = transformToGanttTasks(allTasks);

    return (
        <WorkspaceGanttClient
            workspaceId={workspaceId}
            initialTasks={ganttTasks}
            allTasks={allTasks}
            subtaskDataMap={subtaskDataMap}
            projects={projectOptions}
            members={memberOptions}
            tags={tagOptions}
            projectCounts={tasksData.facets.projects}
        />
    );
}
