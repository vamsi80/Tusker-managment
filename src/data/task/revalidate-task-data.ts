"use server";

import { revalidateTag } from "next/cache";

/**
 * Revalidate task data cache based on the current view
 * This is much faster than router.refresh() as it only invalidates specific cache tags
 */
export async function revalidateTaskData(
    projectId: string,
    userId: string,
    view: 'list' | 'kanban' | 'gantt' | 'all' = 'all'
) {
    try {
        // Revalidate based on view
        switch (view) {
            case 'list':
                // Revalidate list view data
                revalidateTag(`project-tasks-${projectId}`, "layout");
                revalidateTag(`project-tasks-user-${userId}`, "layout");
                break;

            case 'kanban':
                // Revalidate kanban view data (all subtasks)
                revalidateTag(`project-tasks-${projectId}`, "layout");
                revalidateTag(`task-subtasks-all`, "layout");
                break;

            case 'gantt':
                // Revalidate gantt view data
                revalidateTag(`project-tasks-${projectId}`, "layout");
                revalidateTag(`task-subtasks-all`, "layout");
                break;

            case 'all':
            default:
                // Revalidate everything
                revalidateTag(`project-tasks-${projectId}`, "layout");
                revalidateTag(`project-tasks-user-${userId}`, "layout");
                revalidateTag(`project-tasks-all`, "layout");
                revalidateTag(`task-subtasks-all`, "layout");
                break;
        }

        return { success: true };
    } catch (error) {
        console.error("Error revalidating task data:", error);
        return { success: false, error: "Failed to reload data" };
    }
}
