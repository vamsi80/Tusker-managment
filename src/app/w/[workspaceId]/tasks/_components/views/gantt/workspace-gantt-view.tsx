import { getAllTasksFlat } from "@/data/task/gantt/get-all-tasks-flat";
import { validateDependencies } from "@/components/task/gantt/utils";
import { GanttSubtask, GanttTask } from "@/components/task/gantt/types";
import { WorkspaceGanttClient } from "./workspace-gantt-client";

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
    const { tasks: allTasks } = await getAllTasksFlat(workspaceId);

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

    // Transform data to GanttTask format
    const ganttTasks: GanttTask[] = sortedParentTasks.map((parentTask) => {
        // Get subtasks for this parent task
        const taskSubtasks = subtasksMap.get(parentTask.id) || [];

        // Sort subtasks by position
        const sortedSubTasks = taskSubtasks.sort((a, b) => {
            const posA = a.position ?? Number.MAX_SAFE_INTEGER;
            const posB = b.position ?? Number.MAX_SAFE_INTEGER;
            return posA - posB;
        });

        // Transform subtasks first
        const rawSubtasks: GanttSubtask[] = sortedSubTasks.map((subtask) => {
            const startDate = subtask.startDate ? new Date(subtask.startDate) : null;
            const endDate = startDate && subtask.days
                ? new Date(startDate.getTime() + (subtask.days - 1) * 24 * 60 * 60 * 1000)
                : startDate;

            // Format dates as YYYY-MM-DD using local time (not UTC)
            const formatLocalDate = (date: Date | null): string => {
                if (!date) return '';
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            return {
                id: subtask.id,
                name: subtask.name,
                start: formatLocalDate(startDate),
                end: formatLocalDate(endDate),
                status: subtask.status || 'TO_DO',
                // Extract dependency IDs from dependsOn relation
                dependsOnIds: (subtask as any).dependsOn?.map((dep: any) => dep.id) || [],
            };
        });

        // Validate dependencies to compute blocked status
        const validatedSubtasks = validateDependencies(rawSubtasks);

        return {
            id: parentTask.id,
            name: parentTask.name,
            subtasks: validatedSubtasks,
        };
    });

    return (
        <WorkspaceGanttClient
            workspaceId={workspaceId}
            initialTasks={ganttTasks}
            subtaskDataMap={subtaskDataMap}
        />
    );
}
