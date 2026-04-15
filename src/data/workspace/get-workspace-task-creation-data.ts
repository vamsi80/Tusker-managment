import { cache } from "react";
import { WorkspaceService } from "@/server/services/workspace.service";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Optimized data structure for workspace-level task creation
 */
export interface WorkspaceTaskCreationData {
    projects: Array<{
        id: string;
        name: string;
    }>;
    members: Array<{
        id: string;
        workspaceMember: {
            id: string;
            user: {
                id: string;
                surname: string | null;
            };
        };
    }>;
    tags: Array<{
        id: string;
        name: string;
    }>;
    parentTasks: Array<{
        id: string;
        name: string;
        projectId: string;
    }>;
    permissions: {
        isWorkspaceAdmin: boolean;
        canCreateTasks: boolean;
        canCreateSubTasks: boolean;
    };
}

/**
 * Public API - Get all data needed for workspace-level task creation
 * Now calls WorkspaceService directly for server-side efficiency.
 */
export const getWorkspaceTaskCreationData = cache(
    async (workspaceId: string): Promise<WorkspaceTaskCreationData> => {
        try {
            const user = await requireUser();
            return await WorkspaceService.getWorkspaceTaskCreationData(workspaceId, user.id);
        } catch (error) {
            console.error("Error fetching workspace task creation data via Service:", error);
            return {
                projects: [],
                members: [],
                tags: [],
                parentTasks: [],
                permissions: {
                    isWorkspaceAdmin: false,
                    canCreateTasks: false,
                    canCreateSubTasks: false,
                },
            };
        }
    }
);

export type WorkspaceTaskCreationDataType = Awaited<ReturnType<typeof getWorkspaceTaskCreationData>>;
