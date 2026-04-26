"use server";

import { requireUser } from "@/lib/auth/require-user";
import { ProjectService } from "@/server/services/project.service";

/**
 * Server action to fetch full project data.
 * Refactored to use ProjectService for unified data access.
 * 
 * @deprecated Use Hono API (projectsClient.getFullData) for client-side fetching.
 */
export async function getFullProjectDataAction(projectId: string) {
    try {
        const user = await requireUser();
        const data = await ProjectService.getFullProjectData(projectId, user.id);
        
        if (!data) {
            return { success: false, error: "Project not found or access denied" };
        }
        
        return { success: true, data };
    } catch (error: any) {
        console.error("Error in getFullProjectDataAction:", error);
        return { success: false, error: error.message || "Failed to fetch project data" };
    }
}
