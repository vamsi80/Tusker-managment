import { api, request } from "./client";
import type { Tag } from "./workspaces";

export const tagsApi = {
    /** The list route answers { success, tags } rather than { data }. */
    list: async (workspaceId: string) => {
        const body = await request<{ tags: Tag[] }>("/workspace-tags", { query: { workspaceId } });
        return body.tags ?? [];
    },
    create: (workspaceId: string, name: string, requirePurchase = false) =>
        api.post<Tag>("/workspace-tags", { workspaceId, name, requirePurchase }),
    /** updateTagSchema requires the name on every update. */
    update: (workspaceId: string, tagId: string, input: { name: string; requirePurchase: boolean }) =>
        api.patch<Tag>("/workspace-tags", { workspaceId, tagId, ...input }),
    remove: (workspaceId: string, tagId: string) => request("/workspace-tags", { method: "DELETE", query: { workspaceId, tagId } }),
};
