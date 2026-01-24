"use server";

import { getSubTasksByStatus, KanbanFilters } from "@/data/task/kanban/get-subtasks-by-status";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";
const STATUSES: TaskStatus[] = ["TO_DO", "IN_PROGRESS", "CANCELLED", "REVIEW", "HOLD", "COMPLETED"];

/**
 * Server Action: Get Kanban Board Data (All Columns)
 * 
 * Fetches data for all 6 columns in parallel on the server-side.
 * This reduces client-server roundtrips from 6 to 1, significantly improving performance.
 */
export async function getKanbanBoardDataAction(
    workspaceId: string,
    projectId?: string,
    filters?: KanbanFilters
) {
    try {
        // Execute all queries in parallel on the server
        const promises = STATUSES.map(async (status) => {
            const result = await getSubTasksByStatus(
                workspaceId,
                status,
                projectId,
                1, // Page 1
                5, // Page Size
                filters
            );
            return { status, result };
        });

        const results = await Promise.all(promises);

        // Transform into a map for easier client consumption
        const data = results.reduce((acc, { status, result }) => {
            acc[status] = {
                subTasks: result.subTasks,
                totalCount: result.totalCount,
                hasMore: result.hasMore,
                currentPage: 1
            };
            return acc;
        }, {} as Record<TaskStatus, any>);

        return {
            success: true,
            data
        };
    } catch (error) {
        console.error("Error fetching kanban board data:", error);
        return {
            success: false,
            error: "Failed to load kanban board data"
        };
    }
}
