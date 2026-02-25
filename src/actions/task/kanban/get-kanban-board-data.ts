"use server";

import { getTasks } from "@/data/task/get-tasks";
import { type TaskFilters } from "@/components/task/shared/types";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "CANCELLED" | "REVIEW" | "HOLD" | "COMPLETED";
const STATUSES: TaskStatus[] = ["TO_DO", "IN_PROGRESS", "CANCELLED", "REVIEW", "HOLD", "COMPLETED"];

/**
 * Server Action: Get Kanban Board Data (All Columns)
 * 
 * Fetches data for all 6 columns in parallel on the server-side.
 * This reduces client-server roundtrips from 6 to 1, significantly improving performance.
 * Uses unified getTasks function to ensure consistent filtering and permissions.
 */
export async function getKanbanBoardDataAction(
    workspaceId: string,
    projectId?: string,
    filters?: TaskFilters
) {
    try {
        // Execute all queries in parallel on the server
        // Map TaskFilters to getTasks options
        const promises = STATUSES.map(async (status) => {
            const result = await getTasks({
                workspaceId,
                projectId: filters?.projectId || projectId,
                hierarchyMode: "children",
                groupBy: "status",
                status,
                page: 1,
                limit: 5,
                search: (filters as any)?.searchQuery || filters?.search,
                assigneeId: filters?.assigneeId,
                tagId: filters?.tagId,
                startDate: filters?.startDate,
                endDate: filters?.endDate,
                filterParentTaskId: filters?.parentTaskId,
            });
            return { status, result };
        });

        const results = await Promise.all(promises);

        // Transform into a map for easier client consumption
        const data = results.reduce((acc, { status, result }) => {
            acc[status] = {
                subTasks: result.tasks,
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
