export const INDENT_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Manager Review" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "PENDING_OWNER_APPROVAL", label: "Owner Review" },
  { value: "PENDING_OWNER_COMPARATIVE_APPROVAL", label: "Owner Comparative Review" },
  { value: "COMPARATIVES_IN_PROGRESS", label: "Getting Comparatives" },
  { value: "PENDING_MANAGER_FINAL_RATE_APPROVAL", label: "Manager Rate Review" },
  { value: "PENDING_OWNER_FINAL_APPROVAL", label: "Owner Final Review" },
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

export const MATERIAL_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending RFQ" },
  { value: "RFQ_SENT", label: "RFQ Sent" },
  { value: "QUOTES_RECEIVED", label: "Quotes Received" },
  { value: "APPROVED", label: "Approved" },
  { value: "PO_CREATED", label: "PO Created" },
];

export const RFQ_STATUS_OPTIONS = MATERIAL_STATUS_OPTIONS.filter((option) =>
  ["RFQ_SENT", "QUOTES_RECEIVED"].includes(option.value),
);

export const ACTIVE_RFQ_STATUSES = RFQ_STATUS_OPTIONS.map((option) => option.value);
export const CLOSED_PROCUREMENT_STATUSES = ["APPROVED", "PO_CREATED"];

export const parseProcurementStatusParam = (
  value: string | null,
  validStatuses: readonly string[],
) => {
  if (!value || value === "ALL") return [];
  const allowedStatuses = new Set(validStatuses);

  return value
    .split(",")
    .map((status) => status.trim())
    .filter((status) => allowedStatuses.has(status));
};

export const areStatusFiltersEqual = (first: string[], second: string[]) =>
  first.length === second.length && first.every((status, index) => status === second[index]);
