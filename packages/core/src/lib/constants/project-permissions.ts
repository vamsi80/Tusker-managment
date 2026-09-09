import type { ProjectRole } from "@tusker/db";
import type { CapabilityMap } from "./capabilities";

/**
 * Project Permission Matrix
 *
 * The per-project twin of `capabilities.ts`. Where the workspace grid is a
 * ceiling that can only take access away, this matrix is authoritative for the
 * nine ids below: it may both grant and revoke, replacing the hard-coded
 * project-role checks that used to live in `tasks.service.ts`.
 *
 * Resolution order (last wins):
 *   DEFAULT_PROJECT_PERMISSIONS[projectRole]  ->  ProjectMember.permissionOverrides
 *
 * The workspace capability grid still caps the three ids it knows about
 * (task:create / task:edit / task:status) — an admin who revoked task:edit
 * workspace-wide must not be overridden by a project manager.
 *
 * No "server-only" here on purpose: the settings dialog resolves the same map
 * client-side to preview what a checkbox will actually do.
 */

export const PROJECT_PERMISSIONS = [
    { id: "task:create", label: "Create task", group: "Tasks" },
    { id: "task:edit", label: "Edit task", group: "Tasks" },
    { id: "task:status", label: "Change status", group: "Tasks" },
    { id: "task:assign", label: "Change assignee", group: "Tasks" },
    { id: "status:completed", label: "Set Completed", group: "Status" },
    { id: "status:hold", label: "Set On Hold", group: "Status" },
    { id: "status:cancelled", label: "Set Cancelled", group: "Status" },
    { id: "bulk:upload", label: "Bulk upload", group: "Other" },
    { id: "indent:raise", label: "Raise indent", group: "Other" },
] as const;

export type ProjectPermissionId = (typeof PROJECT_PERMISSIONS)[number]["id"];

export type ProjectPermissionMap = Record<ProjectPermissionId, boolean>;

/** Partial map — only the deltas a project manager actually changed are persisted. */
export type ProjectPermissionOverrides = Partial<Record<ProjectPermissionId, boolean>>;

export const PROJECT_ROLES: ProjectRole[] = [
    "PROJECT_MANAGER",
    "PROJECT_COORDINATOR",
    "LEAD",
    "MEMBER",
    "VIEWER",
];

/** Which workspace capability, if any, caps each project permission. */
const WORKSPACE_CEILING: Partial<Record<ProjectPermissionId, keyof CapabilityMap>> = {
    "task:create": "task:create",
    "task:edit": "task:edit",
    "task:status": "task:status",
    "task:assign": "task:edit",
    "status:completed": "task:status",
    "status:hold": "task:status",
    "status:cancelled": "task:status",
    "bulk:upload": "task:create",
};

const all = (value: boolean): ProjectPermissionMap =>
    Object.fromEntries(PROJECT_PERMISSIONS.map((p) => [p.id, value])) as ProjectPermissionMap;

/**
 * Seeded from behaviour as it ships today, so nothing changes until a box is
 * ticked. PM / Coordinator / Lead are the execution roles that could already do
 * all of this; MEMBER could only move status on their own tasks (that ownership
 * scoping is orthogonal and still applies on top); VIEWER could do nothing.
 */
export const DEFAULT_PROJECT_PERMISSIONS: Record<ProjectRole, ProjectPermissionMap> = {
    PROJECT_MANAGER: all(true),
    PROJECT_COORDINATOR: all(true),
    LEAD: all(true),
    MEMBER: { ...all(false), "task:status": true },
    VIEWER: all(false),
};

/** Narrow unknown JSON from the DB to a permission delta, dropping junk keys. */
export function coerceProjectOverrides(raw: unknown): ProjectPermissionOverrides {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: ProjectPermissionOverrides = {};
    for (const { id } of PROJECT_PERMISSIONS) {
        const value = (raw as Record<string, unknown>)[id];
        if (typeof value === "boolean") out[id] = value;
    }
    return out;
}

/**
 * Resolve the effective project permission map for one member.
 * `memberOverrides` is raw JSON straight from Prisma.
 *
 * A workspace OWNER/ADMIN is never locked out of a project they administer —
 * otherwise a project manager could revoke the admin who fixes it.
 */
export function resolveProjectPermissions(
    projectRole: ProjectRole | null | undefined,
    memberOverrides?: unknown,
    workspaceCaps?: CapabilityMap | null,
    isWorkspaceAdmin?: boolean,
): ProjectPermissionMap {
    if (isWorkspaceAdmin) return all(true);
    if (!projectRole) return all(false);

    const resolved: ProjectPermissionMap = {
        ...DEFAULT_PROJECT_PERMISSIONS[projectRole],
        ...coerceProjectOverrides(memberOverrides),
    };

    if (!workspaceCaps) return resolved;

    // The workspace grid is the outer ceiling: it can only take away.
    for (const { id } of PROJECT_PERMISSIONS) {
        const ceiling = WORKSPACE_CEILING[id];
        if (ceiling && workspaceCaps[ceiling] === false) resolved[id] = false;
    }
    return resolved;
}

export function canProject(
    permissions: ProjectPermissionMap | undefined | null,
    permission: ProjectPermissionId,
): boolean {
    return permissions?.[permission] === true;
}

/* ------------------------------------------------------------------ */
/* Project-wide defaults (Project.settings)                            */
/* ------------------------------------------------------------------ */

export interface ProjectSettings {
    /** A status transition that needs an explanation must carry a comment. */
    mandatoryComment: boolean;
    /** ...and/or an attachment. Both false keeps the legacy comment-or-attachment rule. */
    mandatoryAttachment: boolean;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
    mandatoryComment: false,
    mandatoryAttachment: false,
};

export function coerceProjectSettings(raw: unknown): ProjectSettings {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_PROJECT_SETTINGS };
    const source = raw as Record<string, unknown>;
    return {
        mandatoryComment:
            typeof source.mandatoryComment === "boolean"
                ? source.mandatoryComment
                : DEFAULT_PROJECT_SETTINGS.mandatoryComment,
        mandatoryAttachment:
            typeof source.mandatoryAttachment === "boolean"
                ? source.mandatoryAttachment
                : DEFAULT_PROJECT_SETTINGS.mandatoryAttachment,
    };
}

/* ------------------------------------------------------------------ */
/* Shared status-transition rules                                      */
/*                                                                     */
/* These lived in three places — the status endpoint, the edit path,   */
/* and a character-for-character copy in subtask-status-changer.tsx.   */
/* All three now call these, so the UI can never offer a move the API  */
/* rejects.                                                            */
/* ------------------------------------------------------------------ */

export type TransitionStatus = "TO_DO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "HOLD" | "CANCELLED";

const STATUS_PERMISSION: Partial<Record<string, ProjectPermissionId>> = {
    COMPLETED: "status:completed",
    HOLD: "status:hold",
    CANCELLED: "status:cancelled",
};

/** The permission that governs setting `status`, or null for the open ones. */
function permissionForStatus(status: string): ProjectPermissionId | null {
    return STATUS_PERMISSION[status] ?? null;
}

/**
 * Whether this member may set `target` on this task.
 *
 * The assignee of a task is always treated as the worker on it, never the
 * approver, no matter what the matrix says — self-approval is the one rule the
 * matrix does not get to switch off.
 */
export function canSetStatus(
    permissions: ProjectPermissionMap | undefined | null,
    target: string,
    isAssignee: boolean,
): boolean {
    const required = permissionForStatus(target);
    if (!required) return canProject(permissions, "task:status");
    if (isAssignee) return false;
    return canProject(permissions, required);
}

/**
 * Moving a task *out of* REVIEW is an approval decision, so it needs the same
 * standing as marking it Completed.
 */
export function canLeaveReview(
    permissions: ProjectPermissionMap | undefined | null,
    isAssignee: boolean,
): boolean {
    return !isAssignee && canProject(permissions, "status:completed");
}

/** Transitions that demand an explanation before they are allowed through. */
export function isMandatoryTransition(current: string | null | undefined, target: string): boolean {
    return (
        ["HOLD", "CANCELLED", "REVIEW"].includes(target) ||
        (!!current && ["HOLD", "CANCELLED", "COMPLETED"].includes(current)) ||
        (current === "REVIEW" && (target === "TO_DO" || target === "IN_PROGRESS")) ||
        (current === "IN_PROGRESS" && target === "TO_DO")
    );
}

/**
 * What a mandatory transition is missing, or null if it is satisfied.
 *
 * With both project flags off this is the rule as it shipped: a comment OR an
 * attachment. Ticking either flag makes that specific one required on its own.
 */
export function missingTransitionEvidence(
    settings: ProjectSettings,
    has: { comment: boolean; attachment: boolean },
): string | null {
    if (settings.mandatoryComment && !has.comment) {
        return "A comment is required for this status transition.";
    }
    if (settings.mandatoryAttachment && !has.attachment) {
        return "An attachment is required for this status transition.";
    }
    if (!settings.mandatoryComment && !settings.mandatoryAttachment && !has.comment && !has.attachment) {
        return "A comment or attachment link is required for this status transition.";
    }
    return null;
}
