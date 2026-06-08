"use server";

import { workspacesClient } from "@/lib/api-client/workspaces";
import { invalidateWorkspaceTags } from "@/lib/cache/invalidation";

interface UpdateTagInput {
    tagId: string;
    name: string;
    requirePurchase: boolean;
    workspaceId: string;
}

export async function updateTag(data: UpdateTagInput) {
    try {
        const result = await workspacesClient.updateTag(data);
        if (result.success) {
            await invalidateWorkspaceTags(data.workspaceId);
        }
        return result;
    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Failed to update tag",
        };
    }
}
