/** Desktop stand-in for apps/web/src/actions/tag/create-tag.ts: TagService.createTag via /workspace-tags. */
import { passthrough } from "../../lib/desktop-api";

export async function createTag(data: { workspaceId: string; name: string; requirePurchase?: boolean }) {
    return passthrough("/workspace-tags", { body: data }, "Failed to create tag");
}
