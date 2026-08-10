import { AppError } from "@/lib/errors/app-error";

export const INDENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT:                  ["SUBMITTED", "CANCELLED"],
  SUBMITTED:              ["PENDING_OWNER_APPROVAL", "PENDING_PAYMENT", "CANCELLED"],
  PENDING_OWNER_APPROVAL: ["PENDING_PAYMENT", "CANCELLED"],
  ASSIGNED:               ["PENDING_PAYMENT", "APPROVED", "CANCELLED"],
  PENDING_PAYMENT:        ["APPROVED", "CANCELLED"],
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
