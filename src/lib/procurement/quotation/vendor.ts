/**
 * Deterministic vendor identification for remembered column mappings.
 *
 * A GST number is an exact identifier and settles it outright. Names are matched
 * only on an exact normalised equality — "ABC Technologies Pvt Ltd" and "ABC
 * TECHNOLOGIES PRIVATE LIMITED" agree, but "ABC Technologies" and "ABC Traders"
 * never will. Anything short of certain returns no match and the user picks the
 * vendor, because two vendors sharing a mapping would silently import the wrong
 * columns.
 */

import type { QuotationField } from "./columns";

export type VendorLike = {
  id: string;
  name: string;
  companyName?: string | null;
  gstNumber?: string | null;
  quotationMapping?: unknown;
};

/** Saved as the vendor's own header wording → the field it feeds. */
export type SavedMapping = Record<string, QuotationField>;

const FIELDS = new Set<QuotationField>(["itemName", "description", "quantity", "unit", "unitPrice", "amount"]);

const normalizeCompany = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|co|company|and|&)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeGst = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type VendorIdentification = {
  vendor: VendorLike | null;
  /** "gst" is certain; "name" is an exact normalised match; "none" needs the user. */
  basis: "gst" | "name" | "none";
  /** Set when more than one vendor matched, so the caller must ask rather than guess. */
  ambiguous: boolean;
};

export function identifyVendor(
  extracted: { vendorName?: string; gstNumber?: string },
  vendors: VendorLike[]
): VendorIdentification {
  if (extracted.gstNumber) {
    const gst = normalizeGst(extracted.gstNumber);
    const matches = vendors.filter((v) => v.gstNumber && normalizeGst(v.gstNumber) === gst);
    if (matches.length === 1) return { vendor: matches[0], basis: "gst", ambiguous: false };
    if (matches.length > 1) return { vendor: null, basis: "none", ambiguous: true };
  }

  const name = extracted.vendorName ? normalizeCompany(extracted.vendorName) : "";
  if (name.length >= 3) {
    const matches = vendors.filter((v) =>
      [v.companyName, v.name].some((candidate) => candidate && normalizeCompany(candidate) === name)
    );
    if (matches.length === 1) return { vendor: matches[0], basis: "name", ambiguous: false };
    if (matches.length > 1) return { vendor: null, basis: "none", ambiguous: true };
  }

  return { vendor: null, basis: "none", ambiguous: false };
}

/** Validates whatever is on the vendor row — it is free-form JSON in the database. */
export function readSavedMapping(value: unknown): SavedMapping | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const mapping: SavedMapping = {};
  for (const [header, field] of Object.entries(value as Record<string, unknown>)) {
    if (typeof field === "string" && FIELDS.has(field as QuotationField)) {
      mapping[header] = field as QuotationField;
    }
  }
  return Object.keys(mapping).length ? mapping : null;
}

/**
 * Applies a remembered mapping to the headers actually present in this file.
 * Matching on header text rather than position means a vendor adding a column
 * does not shift every mapping by one.
 */
export function applySavedMapping(
  headers: string[],
  saved: SavedMapping
): Partial<Record<QuotationField, number>> {
  const normalized = new Map(Object.entries(saved).map(([header, field]) => [header.trim().toLowerCase(), field]));
  const mapping: Partial<Record<QuotationField, number>> = {};

  headers.forEach((header, index) => {
    const field = normalized.get(header.trim().toLowerCase());
    if (field && mapping[field] === undefined) mapping[field] = index;
  });
  return mapping;
}

/** Turns the mapping the user confirmed back into vendor-worded JSON to store. */
export function toSavedMapping(
  headers: string[],
  mapping: Partial<Record<QuotationField, number>>
): SavedMapping {
  const saved: SavedMapping = {};
  for (const [field, index] of Object.entries(mapping)) {
    const header = headers[index as number]?.trim();
    if (header) saved[header] = field as QuotationField;
  }
  return saved;
}
