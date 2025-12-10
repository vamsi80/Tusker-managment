import { getProjectTasks } from "@/app/data/task/get-project-tasks";
import { GanttChart } from "./gantt-chart";
import { GanttTask } from "./types";

interface GanttContainerProps {
    workspaceId: string;
    projectId: string;
}

export async function GanttContainer({ workspaceId, projectId }: GanttContainerProps) {
    const { tasks: tasksData } = await getProjectTasks(projectId, workspaceId, 1, 100);

    // Transform data to GanttTask format
    // Tasks have only id and name, subtasks have dates
    const ganttTasks: GanttTask[] = tasksData.map((task) => ({
        id: task.id,
        name: task.name,
        subtasks: (task.subTasks || []).map((subtask) => {
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
            };
        }),
    }));

    return (
        <div className="h-[calc(100vh-280px)]">
            <GanttChart tasks={ganttTasks} />
        </div>
    );
}

