"use server";

import { workspacesClient } from "@/lib/api-client/workspaces";
import { invalidateWorkspaceTags } from "@/lib/cache/invalidation";

interface DeleteTagInput {
    tagId: string;
    workspaceId: string;
}

export async function deleteTag(data: DeleteTagInput) {
    try {
        const result = await workspacesClient.deleteTag(data.tagId, data.workspaceId);
        if (result.success) {
            await invalidateWorkspaceTags(data.workspaceId);
        }
        return result;
    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Failed to delete tag",
        };
    }
}
