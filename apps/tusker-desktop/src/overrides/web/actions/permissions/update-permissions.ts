/**
 * Desktop stand-in for apps/web/src/actions/permissions/update-permissions.ts.
 * The workspace-admin routes apply the same rules (owners/admins only, Owner
 * can't be restricted, admins can't change Admin) and return the same data.
 */
import { passthrough } from "../../lib/desktop-api";

export async function updateRolePermission(input: { workspaceId: string; role: string; capability: string; value: boolean | null }) {
    const { workspaceId, ...body } = input;
    return passthrough(`/workspace-admin/${workspaceId}/permissions/role`, { method: "PATCH", body }, "Failed to update permission");
}

export async function updateMemberPermission(input: { workspaceId: string; workspaceMemberId: string; capability: string; value: boolean | null }) {
    const { workspaceId, ...body } = input;
    return passthrough(`/workspace-admin/${workspaceId}/permissions/member`, { method: "PATCH", body }, "Failed to update permission");
}
