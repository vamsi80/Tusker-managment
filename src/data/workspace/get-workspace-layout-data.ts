"use server";
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

        const { 
            leadProjectIds, 
            managedProjectIds, 
            memberProjectIds, 
            viewerProjectIds, 
            ...leanPermissions 
        } = layoutData.permissions;

        return JSON.parse(JSON.stringify({
            ...layoutData,
            permissions: leanPermissions,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            }
        }));
    } catch (error) {
        console.error("Error fetching workspace layout data via Service:", error);
        return {
            user: null,
            workspaces: { workspaces: [], totalCount: 0 },
            metadata: null,
            reportStatus: null,
            projects: [],
            unreadNotificationsCount: 0,
            permissions: {
                isWorkspaceAdmin: false,
                canCreateProject: false,
                workspaceMemberId: null,
                workspaceRole: null,
                userId: null,
            },
            isError: true
        };
    }
});
