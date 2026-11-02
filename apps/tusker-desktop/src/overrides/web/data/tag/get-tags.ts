/** Desktop stand-in for apps/web/src/data/tag/get-tags.ts: the same TagService calls, run by the API. */
import { api } from "../../lib/desktop-api";

export const getWorkspaceTags = (workspaceId: string) => api<any[]>("/desktop/tags", { query: { workspaceId } });

export const getWorkspaceTagsWithCount = (workspaceId: string) => api<any[]>("/desktop/tags", { query: { workspaceId, withCount: "true" } });

export async function getTagById(tagId: string) {
    throw new Error(`getTagById(${tagId}) isn't available in the desktop app`);
}

export async function tagNameExists(_workspaceId: string, _name: string, _excludeTagId?: string) {
    return false; // the API rejects duplicates when saving
}
