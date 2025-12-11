import { getProjectTasks } from "@/app/data/task/get-project-tasks";
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
    const { tasks: tasksData } = await getProjectTasks(projectId, workspaceId, 1, 100);

    // Sort tasks by position first
    const sortedTasks = [...tasksData].sort((a, b) => {
        const posA = a.position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.position ?? Number.MAX_SAFE_INTEGER;
        return posA - posB;
    });

    // Create a map of subtask ID to full subtask data for the details sheet
    const subtaskDataMap = new Map();
    sortedTasks.forEach(task => {
        task.subTasks?.forEach(subtask => {
            subtaskDataMap.set(subtask.id, subtask);
        });
    });

    // Transform data to GanttTask format
    const ganttTasks: GanttTask[] = sortedTasks.map((task) => {
        // Sort subtasks by position
        const sortedSubTasks = (task.subTasks || []).sort((a, b) => {
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
            id: task.id,
            name: task.name,
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
