/**
 * Desktop stand-in for apps/web/src/data/user/get-user-permissions.ts. Same
 * functions, resolved by the same core resolvers on the API (apps/api
 * .../routes/desktop.ts) for the signed-in user. `providedUserId` is accepted
 * for signature parity; the API always answers for the session's user, which is
 * who the website's pages pass anyway.
 */
import { api } from "../../lib/desktop-api";

export const getWorkspacePermissions = async (workspaceId: string, _providedUserId?: string, lean: boolean = false) =>
    api<any>("/desktop/workspace-permissions", { query: { workspaceId, lean: lean ? "true" : undefined } });

export const getUserPermissions = async (workspaceId: string, projectId: string, _providedUserId?: string) =>
    api<any>("/desktop/project-permissions", { query: { workspaceId, projectId } });

export type WorkspacePermissionsType = Awaited<ReturnType<typeof getWorkspacePermissions>>;
export type UserPermissionsType = Awaited<ReturnType<typeof getUserPermissions>>;
