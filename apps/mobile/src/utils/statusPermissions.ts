import { ProjectPermissions } from "../services/api";

/**
 * Whether the current user may move a task into `targetStatus`.
 *
 * Mirrors the server rule in TasksService (packages/core .../tasks.service.ts)
 * and the web client's subtask-status-changer, so the app disables an option
 * instead of letting the request fail with a Forbidden error.
 *
 * Deliberately conservative: it only reports `allowed: false` for rules it can
 * evaluate with certainty. Anything it cannot judge locally (for example the
 * "Lead who created this task" case when the creator is unknown) is left to the
 * server, whose message is then surfaced as-is.
 */
export interface StatusPermissionContext {
    permissions: ProjectPermissions | null;
    /** Current user's id. */
    currentUserId?: string | null;
    /** Task's assignee — compared against both user id and workspace member id. */
    assigneeId?: string | null;
    /** Task creator, when the payload carries it. */
    createdById?: string | null;
    currentStatus?: string | null;
}

export interface StatusPermission {
    allowed: boolean;
    reason?: string;
}

const RESTRICTED = ["COMPLETED", "HOLD", "CANCELLED"];

/** Matrix column governing each approval status — mirrors PROJECT_PERMISSIONS. */
const STATUS_COLUMN: Record<string, string> = {
    COMPLETED: "status:completed",
    HOLD: "status:hold",
    CANCELLED: "status:cancelled",
};

const STATUS_LABEL: Record<string, string> = {
    COMPLETED: "Completed",
    HOLD: "On Hold",
    CANCELLED: "Cancelled",
};

export function getStatusPermission(
    targetStatus: string,
    ctx: StatusPermissionContext
): StatusPermission {
    const { permissions, assigneeId, createdById, currentStatus } = ctx;

    // Without permission data, defer entirely to the server.
    if (!permissions) return { allowed: true };

    // The permissions payload identifies the caller, so screens that do not
    // track the session separately need not pass currentUserId.
    const currentUserId = ctx.currentUserId ?? permissions.userId;

    const isAssignee = !!assigneeId && (
        assigneeId === currentUserId ||
        assigneeId === permissions.workspaceMemberId
    );

    // An assignee acts as the worker on their own task, even if they are also a
    // manager elsewhere: they cannot complete, hold or cancel it, nor move it
    // back out of Review.
    if (isAssignee) {
        if (targetStatus === "COMPLETED") {
            return { allowed: false, reason: "As the assignee, you cannot mark this task as Completed." };
        }
        if (targetStatus === "HOLD") {
            return { allowed: false, reason: "As the assignee, you cannot put this task on Hold." };
        }
        if (targetStatus === "CANCELLED") {
            return { allowed: false, reason: "As the assignee, you cannot cancel this task." };
        }
        if (currentStatus === "REVIEW") {
            return { allowed: false, reason: "As the assignee, you cannot move this task out of Review." };
        }
    }

    const isActingAsManager = !isAssignee && (
        permissions.isWorkspaceAdmin ||
        permissions.isProjectManager ||
        permissions.isProjectCoordinator
    );

    if (RESTRICTED.includes(targetStatus)) {
        // The project's Settings matrix has a column per approval status, resolved
        // server-side. An unticked box disables the option here too.
        const matrix = permissions.projectPermissions;
        if (matrix && matrix[STATUS_COLUMN[targetStatus]] === false) {
            return {
                allowed: false,
                reason: `You don't have permission to set this task to ${STATUS_LABEL[targetStatus]} on this project.`,
            };
        }

        if (!isActingAsManager) {
            // Ownership scoping is orthogonal to the matrix: without project-wide
            // standing you may only approve tasks you created. Where there is no
            // matrix to consult, only a Lead had that standing.
            const mayApproveOwn = matrix ? matrix[STATUS_COLUMN[targetStatus]] === true : permissions.isProjectLead;
            if (!mayApproveOwn) {
                return {
                    allowed: false,
                    reason: `You don't have permission to set this task to ${STATUS_LABEL[targetStatus]}.`,
                };
            }

            // When the creator is unknown we cannot rule it out, so let the server
            // decide rather than disabling a legitimate action.
            if (createdById == null) return { allowed: true };
            const isCreator =
                createdById === currentUserId ||
                createdById === permissions.workspaceMemberId;
            if (isCreator) return { allowed: true };

            return {
                allowed: false,
                reason: `You can only set ${STATUS_LABEL[targetStatus]} on tasks you created.`,
            };
        }
    }

    return { allowed: true };
}

/**
 * Stricter rule for the *edit* form, mirroring web's `isStatusOptionDisabled`
 * in edit-subtask-form.tsx and the server's updateSubTask checks.
 *
 * The edit form cannot collect a transition comment, so on top of the role
 * rules the server rejects any transition that requires one — those must be
 * done from the board/list status changer instead.
 */
export function isEditFormStatusDisabled(
    targetStatus: string,
    ctx: StatusPermissionContext
): StatusPermission {
    const { currentStatus } = ctx;

    // The current status is always selectable (it is a no-op).
    if (targetStatus === currentStatus) return { allowed: true };

    // 1. COMPLETED can only come from REVIEW.
    if (targetStatus === "COMPLETED" && currentStatus !== "REVIEW") {
        return { allowed: false, reason: "Move the task to Review before completing it." };
    }

    // 2 & 3. Role rules for COMPLETED/HOLD/CANCELLED and for leaving REVIEW.
    const role = getStatusPermission(targetStatus, ctx);
    if (!role.allowed) return role;

    if (currentStatus === "REVIEW") {
        const leaving = getStatusPermission("COMPLETED", { ...ctx, currentStatus: undefined });
        if (!leaving.allowed) {
            return {
                allowed: false,
                reason: "Only the Project Manager, Coordinator, or Admin (not personally assigned) can move this task out of Review.",
            };
        }
    }

    // 4. Transitions that require an explanation comment cannot be made here.
    const isMandatoryTransition =
        ["HOLD", "CANCELLED", "REVIEW"].includes(targetStatus) ||
        (!!currentStatus && ["HOLD", "CANCELLED", "COMPLETED"].includes(currentStatus)) ||
        (currentStatus === "REVIEW" && (targetStatus === "TO_DO" || targetStatus === "IN_PROGRESS")) ||
        (currentStatus === "IN_PROGRESS" && targetStatus === "TO_DO");

    if (isMandatoryTransition) {
        return {
            allowed: false,
            reason: "This change needs an explanation comment — update the status from the board or list view.",
        };
    }

    return { allowed: true };
}
