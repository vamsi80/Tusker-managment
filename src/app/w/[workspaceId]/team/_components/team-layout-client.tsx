"use client";

import { useState, useEffect } from "react";
import { workspacesClient } from "@/lib/api-client/workspaces";

interface TeamLayoutClientProps {
    workspaceId: string;
    children: React.ReactNode;
}

/**
 * Client-side shell for the Team section.
 * Handles common header and tabs while fetching site-wide permissions via Hono.
 */
export function TeamLayoutClient({ workspaceId, children }: TeamLayoutClientProps) {
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        async function fetchPermissions() {
            try {
                const layoutData = await workspacesClient.getLayoutData(workspaceId);
                setIsAdmin(layoutData?.permissions?.isWorkspaceAdmin || false);
            } catch (error) {
                console.error("Failed to fetch team layout permissions:", error);
            }
        }
        fetchPermissions();
    }, [workspaceId]);

    return {
        isAdmin,
        // We'll return the UI directly or pass it up
    };
}
