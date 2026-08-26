import { cache } from "react";
import { unstable_cache } from "next/cache";
import { CacheTags } from "@tusker/core/data/cache-tags";
import { TagService } from "@tusker/core/server/services/tag/tag.service";

/**
 * Next-side caching for tag reads. The queries themselves live in TagService so
 * the API serves the same data; only the request/render memoisation is here.
 */

/**
 * Get all tags for a workspace
 */
export const getWorkspaceTags = cache(async (workspaceId: string) => {
    return unstable_cache(
        async () => TagService.listWorkspaceTags(workspaceId),
        [`workspace-tags-${workspaceId}`],
        {
            tags: CacheTags.workspaceTags(workspaceId),
            revalidate: 60 * 60 * 24, // 24 hours
        }
    )();
});

/**
 * Get all tags for a workspace with task counts
 */
export const getWorkspaceTagsWithCount = cache(async (workspaceId: string) => {
    return unstable_cache(
        async () => TagService.listWorkspaceTagsWithCount(workspaceId),
        [`workspace-tags-count-${workspaceId}`],
        {
            tags: CacheTags.workspaceTags(workspaceId),
            revalidate: 60 * 60 * 24, // 24 hours
        }
    )();
});

/**
 * Get a single tag by ID
 */
export async function getTagById(tagId: string) {
    return TagService.getTagById(tagId);
}

/**
 * Check if a tag name already exists in the workspace
 */
export async function tagNameExists(workspaceId: string, name: string, excludeTagId?: string) {
    return TagService.nameExists(workspaceId, name, excludeTagId);
}
