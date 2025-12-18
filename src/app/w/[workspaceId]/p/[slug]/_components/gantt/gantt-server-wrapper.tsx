import { getAllTasksFlat } from "@/data/task";
import { GanttContainer } from "./gantt-container";
import { validateDependencies } from "./utils";
import { GanttSubtask, GanttTask } from "./types";

interface GanttServerWrapperProps {
    workspaceId: string;
    projectId: string;
}

/**
 * Server component that fetches Gantt data
 * This ensures data is fetched on the server (GET request) not client (POST request)
 */
export async function GanttServerWrapper({ workspaceId, projectId }: GanttServerWrapperProps) {
    // Get all tasks in a flat structure (parent tasks + subtasks)
    const { tasks: allTasks } = await getAllTasksFlat(projectId, workspaceId);

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
        <GanttContainer
            workspaceId={workspaceId}
            projectId={projectId}
            initialTasks={ganttTasks}
            subtaskDataMap={subtaskDataMap}
        />
    );
}
