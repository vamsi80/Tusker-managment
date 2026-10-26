import { statusLabel, type ProjectPermissionId, type TaskStatus } from "./constants";

/**
 * Status transition rules, ported from components/task/shared/subtask-status-changer.tsx
 * and @tusker/core/lib/constants/project-permissions.ts. The API enforces them
 * too; mirroring them here greys out what would be refused instead of letting
 * the person try and fail.
 */

export type ProjectAccess = {
    isWorkspaceAdmin: boolean;
    isProjectManager: boolean;
    isProjectCoordinator: boolean;
    isProjectLead: boolean;
    userId: string | null;
    projectMemberId: string | null;
    projectPermissions: Partial<Record<ProjectPermissionId, boolean>>;
    projectSettings: { mandatoryComment: boolean; mandatoryAttachment: boolean };
};

const ROLE_DEFAULTS: Record<string, Partial<Record<ProjectPermissionId, boolean>>> = {
    PROJECT_MANAGER: allPerms(true),
    PROJECT_COORDINATOR: allPerms(true),
    LEAD: allPerms(true),
    MEMBER: { ...allPerms(false), "task:status": true },
    VIEWER: allPerms(false),
};

function allPerms(value: boolean): Partial<Record<ProjectPermissionId, boolean>> {
    const ids: ProjectPermissionId[] = ["task:view_all", "task:create", "task:edit", "task:status", "task:assign", "status:completed", "status:hold", "status:cancelled", "bulk:upload", "indent:raise"];
    return Object.fromEntries(ids.map((id) => [id, value]));
}

/** Fallback when a workspace-wide list has no project-scoped permissions in hand. */
export function fallbackAccess(p: { isWorkspaceAdmin: boolean; userId: string | null; role?: "PROJECT_MANAGER" | "PROJECT_COORDINATOR" | "LEAD" | "MEMBER" }): ProjectAccess {
    const role = p.role ?? "MEMBER";
    return {
        isWorkspaceAdmin: p.isWorkspaceAdmin,
        isProjectManager: role === "PROJECT_MANAGER",
        isProjectCoordinator: role === "PROJECT_COORDINATOR",
        isProjectLead: role === "LEAD",
        userId: p.userId,
        projectMemberId: null,
        projectPermissions: p.isWorkspaceAdmin ? allPerms(true) : ROLE_DEFAULTS[role],
        projectSettings: { mandatoryComment: false, mandatoryAttachment: false },
    };
}

export const can = (access: ProjectAccess | null | undefined, id: ProjectPermissionId) => access?.projectPermissions?.[id] === true;

const STATUS_PERMISSION: Partial<Record<string, ProjectPermissionId>> = {
    COMPLETED: "status:completed",
    HOLD: "status:hold",
    CANCELLED: "status:cancelled",
};

type TaskLike = { status?: string | null; createdBy?: { id?: string } | null; createdById?: string | null; assignee?: { id?: string } | null; assigneeId?: string | null };

export function taskRelation(access: ProjectAccess, task: TaskLike) {
    const isCreator = !!(
        (access.userId && task.createdBy?.id && access.userId === task.createdBy.id) ||
        (access.projectMemberId && task.createdById && access.projectMemberId === task.createdById)
    );
    const isAssignee = !!(
        (access.userId && task.assignee?.id && access.userId === task.assignee.id) ||
        (access.projectMemberId && task.assigneeId && access.projectMemberId === task.assigneeId)
    );
    return { isCreator, isAssignee };
}

export function canChangeStatus(access: ProjectAccess, task: TaskLike) {
    const { isCreator, isAssignee } = taskRelation(access, task);
    const standing = access.isWorkspaceAdmin || access.isProjectManager || access.isProjectCoordinator;
    return can(access, "task:status") && (standing || isCreator || isAssignee);
}

export function transitionCheck(access: ProjectAccess, task: TaskLike, target: TaskStatus): { allowed: boolean; reason?: string } {
    const current = task.status as TaskStatus;
    const { isCreator, isAssignee } = taskRelation(access, task);
    const standing = access.isWorkspaceAdmin || access.isProjectManager || access.isProjectCoordinator;

    const canApprove = (t: TaskStatus) => {
        const required = STATUS_PERMISSION[t];
        const matrix = required ? !isAssignee && can(access, required) : can(access, "task:status");
        return matrix && (standing || isCreator);
    };

    if (!canChangeStatus(access, task)) return { allowed: false, reason: "You do not have permission to update this task." };
    if (isAssignee && ["COMPLETED", "HOLD", "CANCELLED"].includes(target))
        return { allowed: false, reason: `As the assignee, you cannot set this task to ${statusLabel(target)}.` };
    if (isAssignee && current === "REVIEW") return { allowed: false, reason: "As the assignee, you cannot move this task out of Review status." };
    if (["COMPLETED", "HOLD", "CANCELLED"].includes(target) && !canApprove(target))
        return { allowed: false, reason: `You don't have permission to set this task to ${statusLabel(target)}.` };
    if (current === "REVIEW" && !canApprove("COMPLETED")) return { allowed: false, reason: "You cannot move this task out of Review status." };
    if (target === "COMPLETED" && current !== "REVIEW")
        return { allowed: false, reason: "Before marking a task as Completed, you must first move it to Review status." };
    if (current === "COMPLETED" && target !== "COMPLETED" && !(access.isWorkspaceAdmin || access.isProjectManager))
        return { allowed: false, reason: "Only project managers, owners, and admins can move tasks from Completed to Review." };
    return { allowed: true };
}

/** Transitions that demand an explanation before they are allowed through. */
export function isMandatoryTransition(current: string | null | undefined, target: string) {
    return (
        ["HOLD", "CANCELLED", "REVIEW"].includes(target) ||
        (!!current && ["HOLD", "CANCELLED", "COMPLETED"].includes(current)) ||
        (current === "REVIEW" && (target === "TO_DO" || target === "IN_PROGRESS")) ||
        (current === "IN_PROGRESS" && target === "TO_DO")
    );
}

/** With both project flags off: a comment OR an attachment. A ticked flag makes that one required. */
export function missingTransitionEvidence(settings: ProjectAccess["projectSettings"], has: { comment: boolean; attachment: boolean }) {
    if (settings.mandatoryComment && !has.comment) return "A comment is required for this status transition.";
    if (settings.mandatoryAttachment && !has.attachment) return "An attachment is required for this status transition.";
    if (!settings.mandatoryComment && !settings.mandatoryAttachment && !has.comment && !has.attachment)
        return "A comment or attachment link is required for this status transition.";
    return null;
}

/** The web's edit gate: task:edit, and only Admin/PM/Coordinator or the creator for others' tasks. */
export function canEditTask(access: ProjectAccess, task: TaskLike) {
    const { isCreator, isAssignee } = taskRelation(access, task);
    if (!can(access, "task:edit")) return false;
    if (access.isWorkspaceAdmin) return true;
    if (isAssignee) return false;
    if (access.isProjectManager || access.isProjectCoordinator) return true;
    return isCreator;
}
