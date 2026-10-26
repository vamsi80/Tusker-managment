/**
 * Labels, colours and enums mirrored from @tusker/core (zodSchemas,
 * lib/colors, lib/constants, lib/procurement/status-filters). The app installs
 * outside the pnpm workspace, so it carries its own copy — keep them in step.
 */
import { statusTone, tone, toneMap } from "../theme/tone";

// ─── Tasks ──────────────────────────────────────────────────────────────────

export const TASK_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW", "HOLD", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
    TO_DO: "To Do",
    IN_PROGRESS: "In Progress",
    REVIEW: "Review",
    HOLD: "On Hold",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
};

/** Task status colours — the drava status palette for the active theme (theme/tokens statusPalette). */
export const STATUS_COLORS: Record<TaskStatus, string> = new Proxy({} as Record<TaskStatus, string>, {
    get: (_t, key) => (typeof key === "string" ? statusTone(key) : undefined),
});

export const statusLabel = (status?: string | null) =>
    status ? STATUS_LABELS[status as TaskStatus] ?? status : "-";
export const statusColor = (status?: string | null) =>
    (status && statusTone(status)) || statusTone("TO_DO");

// ─── Roles ──────────────────────────────────────────────────────────────────

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MANAGER", "PROCUREMENT", "ACCOUNTS", "MEMBER", "VIEWER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const PROJECT_ROLES = ["PROJECT_MANAGER", "PROJECT_COORDINATOR", "LEAD", "MEMBER", "VIEWER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const roleLabel = (role?: string | null) =>
    role
        ? role
              .split("_")
              .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
              .join(" ")
        : "";

// ─── Projects ───────────────────────────────────────────────────────────────

export const PROJECT_CATEGORIES = [
    { value: "WHITE_TUSKER", label: "White Tusker" },
    { value: "LATTICE_LANE", label: "Lattice Lane" },
    { value: "MISCELLANEOUS", label: "Miscellaneous" },
] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number]["value"];

export const PROJECT_COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#10b981", "#06b6d4", "#0ea5e9",
    "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
];

// ─── Workspace capabilities (lib/constants/capabilities.ts) ─────────────────

export const CAPABILITIES = [
    { id: "project:create", label: "Create a project", group: "Projects" },
    { id: "task:create", label: "Create a task", group: "Tasks" },
    { id: "task:edit", label: "Edit a task", group: "Tasks" },
    { id: "task:status", label: "Change task status", group: "Tasks" },
    { id: "procurement:view", label: "See Procurement tab", group: "Procurement" },
    { id: "vendors:view", label: "See Suppliers / Contractors", group: "Procurement" },
    { id: "points:award", label: "Award or deduct points", group: "Points" },
] as const;
export type Capability = (typeof CAPABILITIES)[number]["id"];
export type CapabilityMap = Partial<Record<Capability, boolean>>;

const allCaps = (value: boolean) => Object.fromEntries(CAPABILITIES.map((c) => [c.id, value])) as Record<Capability, boolean>;
export const DEFAULT_CAPABILITIES: Record<WorkspaceRole, Record<Capability, boolean>> = {
    OWNER: allCaps(true),
    ADMIN: allCaps(true),
    MANAGER: allCaps(true),
    PROCUREMENT: { ...allCaps(true), "project:create": false, "points:award": false },
    ACCOUNTS: { ...allCaps(true), "project:create": false, "points:award": false },
    MEMBER: { ...allCaps(true), "project:create": false, "points:award": false },
    VIEWER: { ...allCaps(true), "project:create": false, "points:award": false },
};

// ─── Project permission matrix (lib/constants/project-permissions.ts) ───────

export const PROJECT_PERMISSIONS = [
    { id: "task:view_all", label: "See all tasks", group: "Visibility", description: "See every task in this project on the board, the dashboard and in task details. When off, those show only tasks assigned to them." },
    { id: "task:create", label: "Create task", group: "Tasks", description: "Add new tasks and subtasks to this project." },
    { id: "task:edit", label: "Edit task", group: "Tasks", description: "Change a task's name, description, dates, tags and reviewer." },
    { id: "task:status", label: "Change status", group: "Tasks", description: "Move tasks between To Do, In Progress and Review." },
    { id: "task:assign", label: "Change assignee", group: "Tasks", description: "Choose or change who a task is assigned to." },
    { id: "status:completed", label: "Set Completed", group: "Approvals", description: "Approve work: mark tasks Completed and move tasks out of Review." },
    { id: "status:hold", label: "Set On Hold", group: "Approvals", description: "Pause a task by putting it On Hold." },
    { id: "status:cancelled", label: "Set Cancelled", group: "Approvals", description: "Cancel a task that is no longer needed." },
    { id: "bulk:upload", label: "Bulk upload", group: "Other", description: "Import many tasks at once from a spreadsheet." },
    { id: "indent:raise", label: "Raise indent", group: "Other", description: "Request materials for this project by raising an indent in Procurement." },
] as const;
export type ProjectPermissionId = (typeof PROJECT_PERMISSIONS)[number]["id"];

// ─── Procurement (lib/procurement/status-filters.ts) ────────────────────────

export const INDENT_STATUS_LABELS: Record<string, string> = {
    DRAFT: "Draft",
    SUBMITTED: "Manager Request Review",
    ASSIGNED: "Assigned",
    PENDING_OWNER_APPROVAL: "Owner Request Review",
    PENDING_OWNER_COMPARATIVE_APPROVAL: "Owner Request Review",
    COMPARATIVES_IN_PROGRESS: "Getting Comparatives",
    PENDING_MANAGER_FINAL_RATE_APPROVAL: "Manager Price Review",
    PENDING_OWNER_FINAL_APPROVAL: "Awaiting Price Approval",
    APPROVED: "Approved",
    REJECTED: "Rejected — Revision Required",
    CANCELLED: "Cancelled",
};

/** Badge tones used by indent-detail-client getIndentStatusBadge. */
export const INDENT_STATUS_TONE: Record<string, string> = toneMap<string>({
    DRAFT: "neutral",
    SUBMITTED: "info",
    ASSIGNED: "info",
    PENDING_OWNER_APPROVAL: "owner",
    PENDING_OWNER_COMPARATIVE_APPROVAL: "owner",
    COMPARATIVES_IN_PROGRESS: "warning",
    PENDING_MANAGER_FINAL_RATE_APPROVAL: "info",
    PENDING_OWNER_FINAL_APPROVAL: "owner",
    APPROVED: "success",
    REJECTED: "danger",
    CANCELLED: "danger",
});

export const INDENT_STATUS_FILTERS = [
    { value: "DRAFT", label: "Draft" },
    { value: "SUBMITTED", label: "Manager Request Review" },
    { value: "PENDING_OWNER_COMPARATIVE_APPROVAL", label: "Owner Request Review" },
    { value: "COMPARATIVES_IN_PROGRESS", label: "Getting Comparatives" },
    { value: "PENDING_MANAGER_FINAL_RATE_APPROVAL", label: "Manager Price Review" },
    { value: "PENDING_OWNER_FINAL_APPROVAL", label: "Awaiting Price Approval" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
    { value: "CANCELLED", label: "Cancelled" },
];

export const AWAITING_APPROVAL_STATUSES = [
    "SUBMITTED",
    "ASSIGNED",
    "PENDING_OWNER_APPROVAL",
    "PENDING_OWNER_COMPARATIVE_APPROVAL",
    "PENDING_MANAGER_FINAL_RATE_APPROVAL",
    "PENDING_OWNER_FINAL_APPROVAL",
];

export const FINAL_RATE_APPROVAL_STATUSES = ["PENDING_MANAGER_FINAL_RATE_APPROVAL", "PENDING_OWNER_FINAL_APPROVAL"];

export const approveActionLabel = (status: string) =>
    FINAL_RATE_APPROVAL_STATUSES.includes(status) ? "Approve Price" : "Start Getting Quotations";

export const MATERIAL_STATUS_LABELS: Record<string, string> = {
    PENDING: "Pending RFQ",
    RFQ_SENT: "RFQ Sent",
    QUOTES_RECEIVED: "Quotes Received",
    APPROVED: "Approved",
    PO_CREATED: "PO Created",
    REJECTED: "Rejected",
};

export const QUOTE_STATUS_TONE: Record<string, string> = toneMap<string>({
    SUBMITTED: "info",
    UNDER_REVIEW: "warning",
    APPROVED: "success",
    REJECTED: "danger",
    EXPIRED: "neutral",
});

export const PO_STATUS_TONE: Record<string, string> = toneMap<string>({
    ORDERED: "info",
    DELIVERED: "success",
    CANCELLED: "danger",
    CLOSED: "neutral",
});

export const VENDOR_STATUS_TONE: Record<string, string> = toneMap<string>({
    ACTIVE: "success",
    INACTIVE: "neutral",
    BLACKLISTED: "danger",
});

export const SERVICE_TYPES = [
    { value: "SUPPLY", label: "Supply" },
    { value: "LABOUR", label: "Labour" },
    { value: "LABOUR_WITH_MATERIAL", label: "Labour with material" },
] as const;

/** lib/procurement/units.ts FALLBACK_UNITS. */
export const FALLBACK_UNITS = [
    { abbreviation: "pcs", name: "Pieces" },
    { abbreviation: "nos", name: "Numbers" },
    { abbreviation: "kg", name: "Kilogram" },
    { abbreviation: "ton", name: "Tonne" },
    { abbreviation: "gm", name: "Gram" },
    { abbreviation: "ltr", name: "Litre" },
    { abbreviation: "ml", name: "Millilitre" },
    { abbreviation: "mtr", name: "Metre" },
    { abbreviation: "ft", name: "Feet" },
    { abbreviation: "cm", name: "Centimetre" },
    { abbreviation: "sqft", name: "Square Feet" },
    { abbreviation: "sqmtr", name: "Square Metre" },
    { abbreviation: "bag", name: "Bag" },
    { abbreviation: "box", name: "Box" },
    { abbreviation: "roll", name: "Roll" },
];

// ─── People ─────────────────────────────────────────────────────────────────

export const ATTENDANCE_STATUS: Record<string, { label: string; tone: string }> = {
    PRESENT: { label: "Present", get tone() { return tone("success"); } },
    LATE: { label: "Late", get tone() { return tone("warning"); } },
    HALF_DAY: { label: "Half Day", get tone() { return tone("warning"); } },
    ABSENT: { label: "Absent", get tone() { return tone("danger"); } },
    ON_LEAVE: { label: "On Leave", get tone() { return tone("leave"); } },
};

export const LEAVE_STATUS_TONE: Record<string, string> = toneMap<string>({
    PENDING: "warning",
    APPROVED: "success",
    REJECTED: "danger",
    DELETED: "neutral",
});

export const LEAVE_TYPES = [
    { value: "CASUAL", label: "Casual" },
    { value: "SICK", label: "Sick" },
] as const;

export const MEETING_TYPES = [
    { value: "INTERNAL", label: "Internal" },
    { value: "CLIENT", label: "Client" },
    { value: "PROJECT_REVIEW", label: "Project Review" },
    { value: "ONE_ON_ONE", label: "One-on-one" },
    { value: "GENERAL", label: "General" },
] as const;

export const MEETING_COLORS: Record<string, string> = {
    indigo: "#6366f1",
    blue: "#3b82f6",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#f43f5e",
    violet: "#8b5cf6",
    slate: "#64748b",
};

export const RSVP_LABELS: Record<string, string> = {
    INVITED: "Invited",
    ACCEPTED: "Going",
    DECLINED: "Not going",
    TENTATIVE: "Maybe",
};

export const REPORT_STATUS_TONE: Record<string, string> = toneMap<string>({
    SUBMITTED: "success",
    NOT_SUBMITTED: "warning",
    ABSENT: "danger",
});
