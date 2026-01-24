import { getAllTasksFlat } from "@/data/task/gantt/get-all-tasks-flat";
import { validateDependencies } from "@/components/task/gantt/utils";
import { GanttSubtask, GanttTask } from "@/components/task/gantt/types";
import { WorkspaceGanttClient } from "./workspace-gantt-client";
import { getUserProjects } from "@/data/project/get-projects";
import { getWorkspaceMembers } from "@/data/workspace/get-workspace-members";
import prisma from "@/lib/db";
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
    // Get all tasks in a flat structure (parent tasks + subtasks) with permission-based filtering
    const [allTasksData, projects, workspaceMembers, projectMemberMatches] = await Promise.all([
        getAllTasksFlat(workspaceId),
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
        })
    ]);

    const { tasks: allTasks } = allTasksData;

    // Separate parent tasks and subtasks
    const parentTasks = allTasks.filter(task => task.parentTaskId === null);
    const subtasksMap = new Map<string, typeof allTasks>();

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
        />
    );
}
