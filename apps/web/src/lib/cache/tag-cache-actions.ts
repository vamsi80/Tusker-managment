"use server";

import { invalidateWorkspaceTags } from "./invalidation";

export async function revalidateTagsCache(workspaceId: string) {
    await invalidateWorkspaceTags(workspaceId);
}
