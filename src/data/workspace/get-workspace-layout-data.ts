import { cache } from "react";
import { WorkspaceService } from "@/server/services/workspace.service";
import { requireUser } from "@/lib/auth/require-user";

/**
 * UNIFIED LAYOUT DATA FETCH
 * Now calls WorkspaceService directly for server-side efficiency.
 */
export const getWorkspaceLayoutData = cache(async (workspaceId: string) => {
    try {
        const user = await requireUser();
        const layoutData = await WorkspaceService.getWorkspaceLayoutData(workspaceId, user.id);
        return layoutData;
    } catch (error) {
        console.error("Error fetching workspace layout data via Service:", error);
        return {
            user: null,
            workspaces: { workspaces: [], totalCount: 0 },
            metadata: null,
            reportStatus: null
        };
    }
});
