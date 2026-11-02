/** Desktop stand-in for apps/web/src/actions/tag/update-tag.ts: TagService.updateTag via /workspace-tags. */
import { passthrough } from "../../lib/desktop-api";

export async function updateTag(data: { workspaceId: string; tagId: string; name: string; requirePurchase?: boolean }) {
    return passthrough("/workspace-tags", { method: "PATCH", body: data }, "Failed to update tag");
}
