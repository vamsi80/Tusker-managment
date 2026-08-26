/**
 * Column detection for vendor quotations.
 *
 * Vendors name the same column a dozen ways, so recognition is a lookup against
 * an editable alias list rather than anything learned. Add a vendor's wording to
 * the list below and it is recognised everywhere — no retraining, no model.
 */

/** The fields an indent line item needs, plus what we can carry alongside. */
export type QuotationField = "itemName" | "description" | "quantity" | "unit" | "unitPrice" | "amount";

export const QUOTATION_FIELD_LABELS: Record<QuotationField, string> = {
  itemName: "Item Name",
  description: "Description",
  quantity: "Quantity",
  unit: "Unit",
  unitPrice: "Unit Price",
  amount: "Amount",
};

export const quotationColumnAliases: Record<QuotationField, string[]> = {
  itemName: [
    "item", "item name", "items", "product", "product name", "description",
    "item description", "product description", "material", "material description",
    "particular", "particulars", "specification", "specifications", "goods",
    "description of goods", "name",
  ],
  description: ["remarks", "details", "make model", "brand", "make", "model", "notes"],
  quantity: ["qty", "quantity", "qnty", "qty.", "nos", "no", "no.", "number", "count", "qty nos"],
  unit: ["unit", "uom", "u o m", "units", "unit of measure", "per"],
  unitPrice: [
    "rate", "price", "unit price", "unit rate", "basic rate", "rate unit",
    "price per unit", "rate per unit", "mrp", "unit cost", "cost", "rate rs",
  ],
  amount: [
    "amount", "total", "line total", "value", "net value", "total amount",
    "total price", "amount rs", "net amount", "taxable value",
  ],
};

/**
 * Collapses the punctuation and spacing vendors vary freely, so "UNIT PRICE",
 * "Unit_Price", "unit-price" and "U.O.M" all compare equal.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[._\-/\\]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Serial-number columns are recognised only so they are never mistaken for an item name. */
const SERIAL_ALIASES = new Set(["sl", "sl no", "s no", "sr", "sr no", "srl", "si no", "seq", "line", "#"]);

export const isSerialHeader = (raw: string) => SERIAL_ALIASES.has(normalizeHeader(raw));

/**
 * Currency and filler words vendors bolt onto a header: "Rate in Rs", "Amount
 * (INR)". Stripped only when the header does not already match something, so
 * genuine aliases like "price per unit" are left intact.
 */
const NOISE_WORDS = /\b(rs|inr|rupees|amt|in|of|the|incl|excl)\b/g;

/**
 * The field a header names, or null when nothing matches.
 *
 * Matching is exact, never substring: an earlier version accepted any header
 * *ending* in a known alias, which quietly read "Bank Name" as an item name and
 * "Account No" as a quantity, scoring a bank-details table as an item table.
 */
export function fieldForHeader(raw: string): QuotationField | null {
  const header = normalizeHeader(raw);
  if (!header || SERIAL_ALIASES.has(header)) return null;

  const exact = (candidate: string) => {
    for (const [field, aliases] of Object.entries(quotationColumnAliases)) {
      if (aliases.includes(candidate)) return field as QuotationField;
    }
    return null;
  };

  const direct = exact(header);
  if (direct) return direct;

  const stripped = header.replace(NOISE_WORDS, " ").replace(/\s+/g, " ").trim();
  return stripped && stripped !== header ? exact(stripped) : null;
}

/** Which column index holds which field. */
export type ColumnMapping = Partial<Record<QuotationField, number>>;

/**
 * Scores how strongly a row reads as an item-table header.
 *
 * Weighted so that the combination that defines an item table — something to
 * name, a quantity, and a price — outranks a wide row of unrelated labels. A
 * bank-details row scores zero however many columns it has.
 */
export function scoreHeaderRow(cells: string[]): { score: number; mapping: ColumnMapping } {
  const mapping: ColumnMapping = {};

  cells.forEach((cell, index) => {
    const field = fieldForHeader(cell);
    // First column wins a field: vendors put "Description" before "Remarks".
    if (field && mapping[field] === undefined) mapping[field] = index;
  });

  const has = (field: QuotationField) => mapping[field] !== undefined;
  let score = 0;
  if (has("itemName")) score += 3;
  if (has("quantity")) score += 3;
  if (has("unitPrice")) score += 3;
  if (has("amount")) score += 2;
  if (has("unit")) score += 1;
  if (has("description")) score += 1;

  // The defining trio. Without a name and either a quantity or a price, whatever
  // this row is, it is not an item table header.
  if (!has("itemName") || (!has("quantity") && !has("unitPrice"))) return { score: 0, mapping };

  // Rows that are mostly recognised columns are more convincing than a stray
  // label buried in prose.
  const filled = cells.filter((c) => c.trim() !== "").length;
  const recognised = Object.keys(mapping).length;
  if (filled > 0 && recognised / filled >= 0.5) score += 2;

  return { score, mapping };
}

/** Headers repeat on every page of a multi-page quotation; those rows must never become items. */
export function isRepeatedHeaderRow(cells: string[], mapping: ColumnMapping): boolean {
  const named = Object.values(mapping).filter((i) => i !== undefined) as number[];
  if (!named.length) return false;
  const matches = named.filter((index) => fieldForHeader(cells[index] ?? "") !== null).length;
  return matches >= Math.max(2, Math.ceil(named.length * 0.6));
}
