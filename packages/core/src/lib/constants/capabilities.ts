import type { WorkspaceRole } from "../../types/workspace";

/**
 * Workspace Capability System
 *
 * A per-workspace, admin-editable layer on top of the hardcoded role matrices in
 * `workspace-access.ts` / `project-access.ts`. Both must pass: this grid is a
 * ceiling, not a grant. Unchecking `task:edit` for MEMBER removes it everywhere,
 * but checking it does NOT give a project-role VIEWER edit rights.
 *
 * Resolution order (last wins):
 *   DEFAULT_CAPABILITIES[role]  ->  workspace override for role  ->  member override
 *
 * OWNER is always fully enabled and cannot be overridden — otherwise an admin
 * could lock every human out of the settings page that fixes it.
 */

export const CAPABILITIES = [
    { id: "project:create", label: "Create a project", group: "Projects" },
    { id: "task:create", label: "Create a task", group: "Tasks" },
    { id: "task:edit", label: "Edit a task", group: "Tasks" },
    { id: "task:status", label: "Change task status", group: "Tasks" },
    { id: "procurement:view", label: "See Procurement tab", group: "Procurement" },
    { id: "vendors:view", label: "See Suppliers / Contractors", group: "Procurement" },
] as const;

export type Capability = (typeof CAPABILITIES)[number]["id"];

export type CapabilityMap = Record<Capability, boolean>;

/** Partial map — only the deltas an admin actually changed are persisted. */
export type CapabilityOverrides = Partial<Record<Capability, boolean>>;

/** Workspace-level: role -> deltas. Stored on `Workspace.permissionOverrides`. */
export type RoleOverrides = Partial<Record<WorkspaceRole, CapabilityOverrides>>;

export const WORKSPACE_ROLES: WorkspaceRole[] = [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "PROCUREMENT",
    "ACCOUNTS",
    "MEMBER",
    "VIEWER",
];

const all = (value: boolean): CapabilityMap =>
    Object.fromEntries(CAPABILITIES.map((c) => [c.id, value])) as CapabilityMap;

/**
 * Seeded from behaviour as it shipped, so enabling this feature changes nothing
 * until an admin flips a switch:
 *  - `project:create` is genuinely workspace-role gated today (OWNER/ADMIN/MANAGER).
 *  - The task capabilities are gated by PROJECT role only, never workspace role,
 *    so they start open and the project matrix keeps doing its job underneath.
 *  - Procurement/Suppliers pages shipped with no view guard at all, so they
 *    start open too. These are the rows most worth tightening first.
 */
export const DEFAULT_CAPABILITIES: Record<WorkspaceRole, CapabilityMap> = {
    OWNER: all(true),
    ADMIN: all(true),
    MANAGER: all(true),
    PROCUREMENT: { ...all(true), "project:create": false },
    ACCOUNTS: { ...all(true), "project:create": false },
    MEMBER: { ...all(true), "project:create": false },
    VIEWER: { ...all(true), "project:create": false },
};

/** Narrow unknown JSON from the DB to a capability delta, dropping junk keys. */
function coerceOverrides(raw: unknown): CapabilityOverrides {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: CapabilityOverrides = {};
    for (const { id } of CAPABILITIES) {
        const value = (raw as Record<string, unknown>)[id];
        if (typeof value === "boolean") out[id] = value;
    }
    return out;
}

export function coerceRoleOverrides(raw: unknown): RoleOverrides {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: RoleOverrides = {};
    for (const role of WORKSPACE_ROLES) {
        const value = (raw as Record<string, unknown>)[role];
        if (value && typeof value === "object") out[role] = coerceOverrides(value);
    }
    return out;
}

export function coerceMemberOverrides(raw: unknown): CapabilityOverrides {
    return coerceOverrides(raw);
}

/**
 * Resolve the effective capability map for one member.
 * `roleOverrides` / `memberOverrides` are raw JSON straight from Prisma.
 */
export function resolveCapabilities(
    role: WorkspaceRole | null | undefined,
    roleOverrides?: unknown,
    memberOverrides?: unknown
): CapabilityMap {
    if (!role) return all(false);
    if (role === "OWNER") return all(true);

    return {
        ...DEFAULT_CAPABILITIES[role],
        ...coerceRoleOverrides(roleOverrides)[role],
        ...coerceMemberOverrides(memberOverrides),
    };
}

export function can(capabilities: CapabilityMap | undefined | null, capability: Capability): boolean {
    return capabilities?.[capability] === true;
}
