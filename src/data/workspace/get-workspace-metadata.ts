import { cache } from "react";
import { WorkspaceService } from "@/server/services/workspace.service";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Lightweight workspace metadata for layouts
 * Now calls WorkspaceService directly for server-side efficiency.
 */
export const getWorkspaceMetadata = cache(async (workspaceId: string) => {
    try {
        const user = await requireUser();
        const metadata = await WorkspaceService.getWorkspaceMetadata(workspaceId, user.id);
        return metadata;
    } catch (error) {
        console.error("Error fetching workspace metadata via Service:", error);
        return null;
    }
});

export type WorkspaceMetadata = Awaited<ReturnType<typeof getWorkspaceMetadata>>;
