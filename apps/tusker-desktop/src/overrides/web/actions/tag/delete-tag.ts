/** Desktop stand-in for apps/web/src/actions/tag/delete-tag.ts: TagService.deleteTag via /workspace-tags. */
import { passthrough } from "../../lib/desktop-api";

export async function deleteTag(data: { workspaceId: string; tagId: string }) {
    return passthrough("/workspace-tags", { method: "DELETE", query: { workspaceId: data.workspaceId, tagId: data.tagId } }, "Failed to delete tag");
}
