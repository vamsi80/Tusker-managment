import { countDateOnlyDays, formatDateOnly, toDateOnly } from "./date-utils";

/**
 * Notification copy for leave requests.
 *
 * Kept out of audit.ts so wording can change without touching the delivery
 * hub. All four LEAVE_* actions previously fell through to audit.ts's enum
 * fallback (`action.replace(/_/g," ").toLowerCase()`), which produced
 * "Priya leave approved" — broken English that also never said whose leave it
 * was, even though every recipient list includes admins who are not involved.
 */

export type LeaveAction =
    | "LEAVE_REQUESTED"
    | "LEAVE_APPROVED"
    | "LEAVE_REJECTED"
    | "LEAVE_DELETED";

export const LEAVE_TITLES: Record<LeaveAction, string> = {
    LEAVE_REQUESTED: "Leave request",
    LEAVE_APPROVED: "Leave approved",
    // The enum says REJECTED; "declined" is kinder for a person's time off.
    LEAVE_REJECTED: "Leave declined",
    LEAVE_DELETED: "Leave withdrawn",
};

export type LeaveNotificationInput = {
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    type?: string | null;
    reason?: string | null;
};

const REASON_MAX = 40;

/** "casual" / "sick"; anything unrecognised is dropped rather than guessed at. */
function typeLabel(type?: string | null) {
    const value = (type ?? "").toLowerCase();
    return value === "sick" || value === "casual" ? `${value} ` : "";
}

/**
 * "12 Sep" for a single day, "12-14 Sep" inside one month, "28 Sep - 2 Oct"
 * across months.
 *
 * leave_request.startDate/endDate are `@db.Date` (midnight UTC), so these go
 * through formatDateOnly, which reads the UTC parts. Formatting them with a
 * plain toLocaleDateString would shift the day for viewers east of UTC and
 * show the wrong dates on exactly the notification that matters.
 */
export function formatLeaveRange(
    start?: string | Date | null,
    end?: string | Date | null,
): string {
    const from = toDateOnly(start ?? null);
    const to = toDateOnly(end ?? null) ?? from;
    if (!from || !to) return "";

    if (from.getTime() === to.getTime()) return formatDateOnly(from, "d MMM");
    if (from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()) {
        return `${formatDateOnly(from, "d")}-${formatDateOnly(to, "d MMM")}`;
    }
    return `${formatDateOnly(from, "d MMM")} - ${formatDateOnly(to, "d MMM")}`;
}

function dayCount(leave: LeaveNotificationInput): number {
    const from = toDateOnly(leave.startDate ?? null);
    const to = toDateOnly(leave.endDate ?? null) ?? from;
    if (!from || !to) return 0;
    return countDateOnlyDays(from, to);
}

function reasonSuffix(reason?: string | null): string {
    const text = (reason ?? "").trim();
    if (!text) return "";
    const short = text.length > REASON_MAX ? `${text.slice(0, REASON_MAX).trimEnd()}...` : text;
    return ` - "${short}"`;
}

/**
 * The body shown to one recipient.
 *
 * `viewerIsSubject` splits the two audiences that share a leave notification:
 * the person whose leave it is reads "Your leave ...", everyone else (their
 * manager and every workspace admin) needs the name, or "Leave approved" tells
 * them nothing. No pronouns anywhere - the app does not store gender.
 */
export function leaveNotificationBody(params: {
    action: LeaveAction;
    actorName: string;
    subjectName: string;
    leave: LeaveNotificationInput;
    viewerIsSubject: boolean;
}): string {
    const { action, actorName, subjectName, leave, viewerIsSubject } = params;
    const range = formatLeaveRange(leave.startDate, leave.endDate);
    const forRange = range ? ` for ${range}` : "";
    const onRange = range ? `, ${range}` : "";
    const kind = typeLabel(leave.type);

    switch (action) {
        case "LEAVE_REQUESTED": {
            if (viewerIsSubject) {
                return `Your ${kind}leave${forRange} is awaiting approval`;
            }
            const days = dayCount(leave);
            const amount = days > 0 ? `${days} day${days > 1 ? "s" : ""} ` : "";
            return `${subjectName} requested ${amount}${kind}leave${onRange}${reasonSuffix(leave.reason)}`;
        }
        case "LEAVE_APPROVED":
            return viewerIsSubject
                ? `Your ${kind}leave${forRange} was approved by ${actorName}`
                : `${actorName} approved ${subjectName}'s ${kind}leave${onRange}`;
        case "LEAVE_REJECTED":
            return viewerIsSubject
                ? `Your ${kind}leave${forRange} was declined by ${actorName}`
                : `${actorName} declined ${subjectName}'s ${kind}leave${onRange}`;
        case "LEAVE_DELETED":
            return viewerIsSubject
                ? `You withdrew your ${kind}leave request${forRange}`
                : `${subjectName} withdrew their ${kind}leave request${forRange}`;
    }
}
