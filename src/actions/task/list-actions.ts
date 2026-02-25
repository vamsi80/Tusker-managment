"use server";

import { getTasks, GetTasksOptions } from "@/data/task/get-tasks";

export async function loadTasksAction(opts: GetTasksOptions) {
    try {
        const result = await getTasks(opts);

        const tasksByProject: Record<string, typeof result.tasks> = {};
        const tasksByStatus: Record<string, typeof result.tasks> = {};

        result.tasks.forEach(task => {
            const pid = task.projectId || "unknown";
            if (!tasksByProject[pid]) tasksByProject[pid] = [];
            tasksByProject[pid].push(task);

            const status = task.status || "UNKNOWN";
            if (!tasksByStatus[status]) tasksByStatus[status] = [];
            tasksByStatus[status].push(task);
        });

        return {
            success: true as const,
            data: {
                ...result,
                tasksByProject,
                tasksByStatus,
            },
        };
    } catch (error) {
        console.error("Error in loadTasksAction:", error);
        return {
            success: false as const,
            error: "Failed to load tasks",
        };
    }
}

export type LoadTasksResponse = Awaited<ReturnType<typeof loadTasksAction>>;
