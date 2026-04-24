import { cache } from "react";
import { headers } from "next/headers";
import app from "@/hono";

/**
 * Lightweight workspace metadata for layouts
 * Refactored to call the Hono API internally for consistency.
 */
export const getWorkspaceMetadata = cache(async (workspaceId: string) => {
    try {
        const res = await app.request(`/api/v1/workspaces/${workspaceId}/metadata`, {
            headers: await headers(),
        });

        if (!res.ok) {
            return null;
        }

        const result = await res.json();
        return result.data;
    } catch (error) {
        console.error("Error fetching workspace metadata via Hono API:", error);
        return null;
    }
});

export type WorkspaceMetadata = Awaited<ReturnType<typeof getWorkspaceMetadata>>;
