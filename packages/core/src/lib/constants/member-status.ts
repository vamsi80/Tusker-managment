/**
 * Removing a member deactivates rather than deletes: nothing is destroyed, so
 * authorship (Task.createdById is RESTRICT onto ProjectMember) and history stay
 * truthful. `WorkspaceMember.deactivatedAt` is the single source of truth for
 * "still in this workspace".
 *
 * Spread this into any WorkspaceMember `where` that feeds a permission check, a
 * member picker, a team list, or a notification fan-out. Deliberately NOT
 * applied to every read: a deactivated person SHOULD still appear as the author
 * of tasks they created, which is the whole point of not deleting them.
 */
export const ACTIVE_MEMBER = { deactivatedAt: null } as const;

/**
 * Statuses that count as outstanding work a leaver must hand over before they
 * can be removed. Anything else is finished and stays attributed to whoever
 * did it.
 */
export const PENDING_TASK_STATUSES = [
  "TO_DO",
  "IN_PROGRESS",
  "REVIEW",
  "HOLD",
] as const;
