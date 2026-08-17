import { AppError } from "@/lib/errors/app-error";

export const INDENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT:                  ["SUBMITTED", "CANCELLED"],
  SUBMITTED:              ["PENDING_OWNER_COMPARATIVE_APPROVAL", "ASSIGNED", "REJECTED", "CANCELLED"],
  ASSIGNED:               ["PENDING_OWNER_COMPARATIVE_APPROVAL", "REJECTED", "CANCELLED"],
  PENDING_OWNER_COMPARATIVE_APPROVAL: ["COMPARATIVES_IN_PROGRESS", "REJECTED", "CANCELLED"],
  COMPARATIVES_IN_PROGRESS: ["PENDING_MANAGER_FINAL_RATE_APPROVAL", "CANCELLED"],
  PENDING_MANAGER_FINAL_RATE_APPROVAL: ["PENDING_OWNER_FINAL_APPROVAL", "REJECTED", "CANCELLED"],
  PENDING_OWNER_FINAL_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  REJECTED:               ["SUBMITTED", "PENDING_MANAGER_FINAL_RATE_APPROVAL", "CANCELLED"],
  APPROVED:               [],
  CANCELLED:              [],
};

export const LINE_ITEM_TRANSITIONS: Record<string, string[]> = {
  PENDING:           ["RFQ_SENT", "REJECTED"],
  RFQ_SENT:          ["QUOTES_RECEIVED", "REJECTED"],
  QUOTES_RECEIVED:   ["APPROVED", "RFQ_SENT", "REJECTED"],
  APPROVED:          ["PO_CREATED"],
  PO_CREATED:        [],
  REJECTED:          [],
};

export function assertTransition(map: Record<string, string[]>, from: string, to: string, entity: string) {
  if (!map[from]?.includes(to)) {
    throw AppError.ValidationError(`${entity} cannot transition from ${from} to ${to}`);
  }
}
