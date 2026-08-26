"use server";

import { z } from "zod";
import prisma from "@tusker/db";
import { getSession } from "@/lib/auth/require-user";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { invalidateWorkspace, invalidateWorkspaceMembers } from "@/lib/cache/invalidation";
import {
    CAPABILITIES,
    WORKSPACE_ROLES,
    coerceRoleOverrides,
    coerceMemberOverrides,
    type Capability,
} from "@/lib/constants/capabilities";

const capabilityId = z.enum(
    CAPABILITIES.map((c) => c.id) as [Capability, ...Capability[]]
);

const schema = z.object({
    workspaceId: z.string().min(1),
    role: z.enum(WORKSPACE_ROLES as [string, ...string[]]),
    capability: capabilityId,
    /** null clears the override and falls back to the role default. */
    value: z.boolean().nullable(),
});

const memberSchema = z.object({
    workspaceId: z.string().min(1),
    workspaceMemberId: z.string().min(1),
    capability: capabilityId,
    value: z.boolean().nullable(),
});

/**
 * Only OWNER and ADMIN may reach the permissions grid. The tab is hidden and the
 * page redirects for everyone else, but this is the check that actually matters —
 * the two in front of it are cosmetic.
 */
async function requirePermissionAdmin(workspaceId: string) {
    const session = await getSession();
    if (!session) return { error: "Unauthorized" as const };

    const permissions = await getWorkspacePermissions(workspaceId, session.user.id, true);
    const role = permissions.workspaceRole;
    if (role !== "OWNER" && role !== "ADMIN") {
        return { error: "Only workspace owners and admins can change permissions" as const };
    }
    return { role };
}

/** Write one cell of the role grid. */
export async function updateRolePermission(input: z.infer<typeof schema>) {
    try {
        const { workspaceId, role, capability, value } = schema.parse(input);

        const gate = await requirePermissionAdmin(workspaceId);
        if (gate.error) return { success: false, error: gate.error };

        // OWNER is always fully enabled; the resolver ignores overrides on it, so
        // refuse rather than silently persisting a delta that does nothing.
        if (role === "OWNER") {
            return { success: false, error: "The Owner role cannot be restricted" };
        }
        // An admin may not strip admin rights from their own role and lock the
        // workspace out of this page. Owners can still demote ADMIN.
        if (role === "ADMIN" && gate.role === "ADMIN") {
            return { success: false, error: "Admins cannot change Admin permissions" };
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { permissionOverrides: true },
        });
        if (!workspace) return { success: false, error: "Workspace not found" };

        const overrides = coerceRoleOverrides(workspace.permissionOverrides);
        const forRole = { ...(overrides[role as keyof typeof overrides] ?? {}) };

        if (value === null) delete forRole[capability];
        else forRole[capability] = value;

        const next = { ...overrides, [role]: forRole };
        if (Object.keys(forRole).length === 0) delete (next as Record<string, unknown>)[role];

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: { permissionOverrides: next },
        });

        await invalidateWorkspace(workspaceId);
        await invalidateWorkspaceMembers(workspaceId);

        return { success: true, data: next };
    } catch (error) {
        console.error("Error updating role permission:", error);
        if (error instanceof z.ZodError) {
            return { success: false, error: error.issues[0].message };
        }
        return { success: false, error: "Failed to update permission" };
    }
}

/** Write one per-member exception, which wins over that member's role row. */
export async function updateMemberPermission(input: z.infer<typeof memberSchema>) {
    try {
        const { workspaceId, workspaceMemberId, capability, value } = memberSchema.parse(input);

        const gate = await requirePermissionAdmin(workspaceId);
        if (gate.error) return { success: false, error: gate.error };

        const member = await prisma.workspaceMember.findFirst({
            where: { id: workspaceMemberId, workspaceId },
            select: { id: true, workspaceRole: true, permissionOverrides: true },
        });
        if (!member) return { success: false, error: "Member not found" };

        if (member.workspaceRole === "OWNER") {
            return { success: false, error: "The workspace owner cannot be restricted" };
        }
        if (member.workspaceRole === "ADMIN" && gate.role === "ADMIN") {
            return { success: false, error: "Admins cannot restrict other admins" };
        }

        const overrides = coerceMemberOverrides(member.permissionOverrides);
        if (value === null) delete overrides[capability];
        else overrides[capability] = value;

        await prisma.workspaceMember.update({
            where: { id: member.id },
            // Prisma reads `undefined` as "leave alone", so write the empty object
            // rather than skipping the clear entirely.
            data: { permissionOverrides: overrides },
        });

        await invalidateWorkspaceMembers(workspaceId);

        return { success: true, data: overrides };
    } catch (error) {
        console.error("Error updating member permission:", error);
        if (error instanceof z.ZodError) {
            return { success: false, error: error.issues[0].message };
        }
        return { success: false, error: "Failed to update permission" };
    }
}
