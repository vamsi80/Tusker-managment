import { cache } from "react";
import { WorkspaceService } from "@/server/services/workspace.service";

/**
 * Fetches and groups all project members in a workspace.
 * Now calls WorkspaceService directly for server-side efficiency.
 */
/**
 * Fetches and groups all project members in a workspace.
 * Returns a map of projectId -> { id, surname }[]
 */
export const getWorkspaceProjectAssignments = cache(async (workspaceId: string) => {
    try {
        const projectAssignments = await WorkspaceService.getWorkspaceProjectAssignments(workspaceId);
        return projectAssignments;
    } catch (error) {
        console.error("Error fetching project assignments via Service:", error);
        return {};
    }
});

/**
 * Fetches all project leaders in a workspace for attribution.
 */
export const getWorkspaceProjectLeaders = cache(async (workspaceId: string) => {
    try {
        const projectLeaders = await WorkspaceService.getWorkspaceProjectLeaders(workspaceId);
        return projectLeaders;
    } catch (error) {
        console.error("Error fetching project leaders via Service:", error);
        return {};
    }
});
