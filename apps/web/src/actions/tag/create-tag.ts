"use server";

import { workspacesClient } from "@/lib/api-client/workspaces";
import { invalidateWorkspaceTags } from "@/lib/cache/invalidation";

interface CreateTagInput {
    name: string;
    requirePurchase: boolean;
    workspaceId: string;
    projectId?: string;
}

export async function createTag(data: CreateTagInput) {
    try {
        const result = await workspacesClient.createTag(data);
        if (result.success) {
            await invalidateWorkspaceTags(data.workspaceId);
        }
        return result;
    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Failed to create tag",
        };
    }
}
