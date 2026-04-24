import { cache } from "react";
import { headers } from "next/headers";
import app from "@/hono";

/**
 * UNIFIED LAYOUT DATA FETCH
 * Refactored to call the Hono API internally for consistency.
 */
export const getWorkspaceLayoutData = cache(async (workspaceId: string) => {
    try {
        const res = await app.request(`/api/v1/workspaces/${workspaceId}/layout`, {
            headers: await headers(),
        });

        if (!res.ok) {
            throw new Error(`API Error: ${res.status}`);
        }

        const result = await res.json();
        const layoutData = result.data;

        // Note: The API already includes user info and lean permissions in its response
        return JSON.parse(JSON.stringify(layoutData));
    } catch (error) {
        console.error("Error fetching workspace layout data via Hono API:", error);
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
