import { getWorkspaceTasks } from "@/data/task";
import { getSubTasksByParentIds } from "@/data/task/get-subtasks-batch";
import { transformToGanttTasks } from "@/components/task/gantt/transform-tasks";
import { ProjectGanttClient } from "./project-gantt-client";

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

    // 4. Transform to Gantt Structure
    const ganttTasks = transformToGanttTasks(allTasks);

    // 5. Get Project Counts
    const projectCounts = tasksData.facets.projects;

    return (
        <ProjectGanttClient
            workspaceId={workspaceId}
            projectId={projectId}
            initialTasks={ganttTasks}
            subtaskDataMap={subtaskDataMap}
            projectCounts={projectCounts}
        />
    );
}
