"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/require-user";
import {
    fetchWorkspacePermissions,
    fetchUserPermissions,
} from "@tusker/core/permissions";

/**
 * Session-aware wrappers around the pure resolvers in @tusker/core.
 *
 * The resolution logic itself is framework-agnostic and shared with the API;
 * only the "who is asking" fallback belongs here, since it reads the request
 * cookies through next/headers.
 */

async function resolveUserId(providedUserId?: string): Promise<string> {
    // If userId is provided (e.g. from a Server Action), bypass the session lookup to save ~1s
    if (providedUserId) return providedUserId;
    const session = await getSession();
    // A redirect, not a throw: the session cookie can outlive its session, so
    // this runs during render, where a throw is an uncaught page crash.
    if (!session) redirect("/sign-in");
    return session.user.id;
}

/**
 * Get workspace-level permissions for the current user
 */
export const getWorkspacePermissions = async (
    workspaceId: string,
    providedUserId?: string,
    lean: boolean = false
) => {
    const userId = await resolveUserId(providedUserId);
    return await fetchWorkspacePermissions(workspaceId, userId, lean);
};

/**
 * Get project-level permissions for the current user
 */
export const getUserPermissions = async (
    workspaceId: string,
    projectId: string,
    providedUserId?: string
) => {
    const userId = await resolveUserId(providedUserId);
    return await fetchUserPermissions(workspaceId, projectId, userId);
};

export type WorkspacePermissionsType = Awaited<ReturnType<typeof getWorkspacePermissions>>;
export type UserPermissionsType = Awaited<ReturnType<typeof getUserPermissions>>;
