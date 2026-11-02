/** Desktop stand-in for apps/web/src/data/audit/get-activity.ts: the same admin-only audit query, on the API. */
import { api } from "../../lib/desktop-api";

export async function getWorkspaceActivity(workspaceId: string) {
    return api<any[]>(`/workspace-admin/${workspaceId}/activity`);
}
