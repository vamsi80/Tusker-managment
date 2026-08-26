/**
 * Turns a grid into quotation items.
 *
 * Every decision here is a rule you can read, step through and change. Nothing is
 * inferred by a model, so the same file always produces the same items — and when
 * it produces the wrong ones, the rule that did it is findable.
 *
 * Vendor figures are never rewritten. Where a vendor's own arithmetic disagrees
 * with ours the row carries a warning and both numbers survive to the preview.
 */

import {
  isRepeatedHeaderRow,
  scoreHeaderRow,
  type ColumnMapping,
  type QuotationField,
} from "./columns";
import { toNumber } from "@/lib/procurement/quote-match";

export type ItemStatus = "valid" | "warning" | "error";

export type QuotationItem = {
  itemName: string;
  description?: string;
  quantity: number | null;
  unit?: string;
  unitPrice: number | null;
  /** The vendor's own line total, kept as printed even when it disagrees with ours. */
  amount: number | null;
  /** 1-based row in the source grid, for tracing a row back to the file. */
  sourceRow: number;
  status: ItemStatus;
  warnings: string[];
};

export type ExtractedQuotation = {
  vendorName?: string;
  /** Used to identify the vendor exactly, for remembered column mappings. */
  gstNumber?: string;
  quotationNumber?: string;
  quotationDate?: string;
  items: QuotationItem[];
  subtotal?: number;
  tax?: number;
  grandTotal?: number;
  mapping: ColumnMapping;
  /** Header text per mapped column, for the mapping UI and for saving per vendor. */
  headers: string[];
  headerRow: number;
  warnings: string[];
};

/** How far down a sheet a header may reasonably hide behind letterhead and addresses. */
const MAX_HEADER_SEARCH_ROWS = 40;

/** Rounding slack when checking quantity × rate against the vendor's own amount. */
const AMOUNT_TOLERANCE = 1;

const SUMMARY_LABEL =
  /^(sub\s*-?\s*total|total|grand\s*total|net\s*(amount|total|payable)|amount\s*(in|chargeable)|gst|cgst|sgst|igst|vat|tax|taxable|discount|round\s*-?\s*off|less|add|advance|balance|terms|conditions|bank|ifsc|account|declaration|signature|for\s+\w|e\s*&\s*oe|thank)/i;

/**
 * A row is a summary only when its *structure* says so, never on its wording
 * alone. "Installation 1 Job 25000" is a legitimate line item; "Installation
 * charges  25,000" with no quantity and no rate is not. This is what keeps
 * freight, transport and installation importable when a vendor sells them.
 */
export function isSummaryRow(
  cells: string[],
  mapping: ColumnMapping,
  parsed: { quantity: number | null; unitPrice: number | null; amount: number | null }
): boolean {
  const name = (mapping.itemName !== undefined ? cells[mapping.itemName] : "")?.trim() ?? "";
  const labelLooksLikeSummary = SUMMARY_LABEL.test(name);

  // A priced, counted row is an item whatever it is called.
  if (parsed.quantity !== null && parsed.unitPrice !== null) return false;

  if (labelLooksLikeSummary) return true;

  // An unnamed row carrying only a figure is a total the vendor did not label in
  // the name column (the label often sits in a merged cell further left).
  if (!name && parsed.amount !== null && parsed.quantity === null && parsed.unitPrice === null) {
    return true;
  }
  return false;
}

/**
 * "5 PCS" → 5 with unit "PCS". The unit travels with the quantity in most vendor
 * sheets that lack a separate UOM column, and dropping it loses real information.
 */
export function parseQuantity(raw: string | undefined): { quantity: number | null; unit?: string } {
  const text = (raw ?? "").trim();
  if (!text) return { quantity: null };

  const quantity = toNumber(text);
  if (quantity === null) return { quantity: null };

  // Whatever letters follow the number are the unit, unless it is a currency word.
  const suffix = text.replace(/^[^a-zA-Z]*/, "").trim();
  const unit = suffix && !/^(rs|inr|only)\b/i.test(suffix) ? suffix.replace(/[.,]+$/, "") : undefined;
  return { quantity, unit: unit || undefined };
}

/** Finds the row that reads most like an item-table header, and how it maps. */
export function detectHeader(grid: string[][]): { row: number; mapping: ColumnMapping; score: number } {
  let best = { row: -1, mapping: {} as ColumnMapping, score: 0 };

  const limit = Math.min(grid.length, MAX_HEADER_SEARCH_ROWS);
  for (let row = 0; row < limit; row++) {
    const { score, mapping } = scoreHeaderRow(grid[row]);
    if (score > best.score) best = { row, mapping, score };
  }
  return best;
}

const cell = (row: string[], index: number | undefined) =>
  index === undefined ? undefined : row[index];

/** Pulls vendor/quotation identity out of the rows above the table. */
function readPreamble(grid: string[][], headerRow: number) {
  const text = grid.slice(0, headerRow).map((row) => row.join(" ").trim()).filter(Boolean);
  const joined = text.join("\n");

  // A reference must contain a digit: without that check the bare heading
  // "QUOTATION" sitting above "Quotation No: QT-1024" was captured instead.
  const quotationNumber = [
    ...joined.matchAll(/(?:quotation|quote|estimate|ref|proforma)\s*(?:no|number|#)?\.?\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9/_\-]*\d[A-Za-z0-9/_\-]*)/gi),
  ]
    .map((match) => match[1])
    .find((candidate) => /\d/.test(candidate));
  const quotationDate = /date\s*[:.\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/i.exec(joined)?.[1];
  const gstNumber = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9])\b/i.exec(joined)?.[1];

  // The vendor's name is nearly always the first substantial line of letterhead,
  // above any label like "Quotation".
  const vendorName = text.find(
    (line) => line.length > 3 && line.length < 80 && !/^(quotation|quote|estimate|tax invoice|proforma)\b/i.test(line)
  );

  return { vendorName, quotationNumber, quotationDate, gstNumber };
}

export type ParseOptions = {
  /** Overrides automatic detection, e.g. a mapping remembered for this vendor. */
  mapping?: ColumnMapping;
  /** Set when the grid came from OCR, so rows can be flagged as less certain. */
  fromOcr?: boolean;
};

export function parseQuotationGrid(grid: string[][], options: ParseOptions = {}): ExtractedQuotation {
  const warnings: string[] = [];

  const detected = detectHeader(grid);
  const mapping = options.mapping ?? detected.mapping;
  const headerRow = detected.row;

  if (headerRow < 0 || Object.keys(mapping).length === 0) {
    return {
      items: [], mapping: {}, headers: [], headerRow: -1,
      warnings: ["Could not find an item table — map the columns manually."],
    };
  }
  if (detected.score < 8) warnings.push("Header not confidently detected — check the column mapping.");
  if (options.fromOcr) warnings.push("Read by OCR, so values may be inaccurate — check rates against the original.");

  const preamble = readPreamble(grid, headerRow);
  const items: QuotationItem[] = [];
  const seen = new Map<string, number>();
  let subtotal: number | undefined;
  let tax: number | undefined;
  let grandTotal: number | undefined;

  for (let row = headerRow + 1; row < grid.length; row++) {
    const cells = grid[row];
    if (!cells.some((c) => c.trim() !== "")) continue;

    // Page 2 of a multi-page quotation repeats the header; it is not a product.
    if (isRepeatedHeaderRow(cells, mapping)) continue;

    const rawQuantity = cell(cells, mapping.quantity);
    const { quantity, unit: unitFromQuantity } = parseQuantity(rawQuantity);
    const unitPrice = toNumber(cell(cells, mapping.unitPrice));
    const amount = toNumber(cell(cells, mapping.amount));
    const itemName = (cell(cells, mapping.itemName) ?? "").trim();

    if (isSummaryRow(cells, mapping, { quantity, unitPrice, amount })) {
      const label = itemName.toLowerCase();
      const value = amount ?? unitPrice;
      if (value !== null) {
        if (/grand|net/.test(label)) grandTotal = value;
        else if (/sub/.test(label)) subtotal = value;
        else if (/gst|tax|vat/.test(label)) tax = (tax ?? 0) + value;
      }
      continue;
    }

    // A row with nothing but a name is a wrapped description or a section title.
    if (!itemName && quantity === null && unitPrice === null && amount === null) continue;

    const rowWarnings: string[] = [];
    if (!itemName) rowWarnings.push("Missing item name");
    if (quantity === null) rowWarnings.push(rawQuantity?.trim() ? "Quantity not understood" : "Missing quantity");
    if (unitPrice === null) rowWarnings.push("Missing unit price");

    if (quantity !== null && unitPrice !== null && amount !== null) {
      const expected = quantity * unitPrice;
      if (Math.abs(expected - amount) > AMOUNT_TOLERANCE) {
        // Both figures are reported; nothing is silently corrected.
        rowWarnings.push(
          `Amount does not match Qty × Unit Price (vendor ${amount.toLocaleString("en-IN")}, calculated ${expected.toLocaleString("en-IN")})`
        );
      }
    }

    const key = `${itemName.toLowerCase()}|${quantity}|${unitPrice}`;
    if (itemName && seen.has(key)) rowWarnings.push(`Duplicate of row ${seen.get(key)}`);
    else if (itemName) seen.set(key, row + 1);

    items.push({
      itemName,
      description: cell(cells, mapping.description)?.trim() || undefined,
      quantity,
      unit: (cell(cells, mapping.unit) ?? unitFromQuantity ?? "").trim() || undefined,
      unitPrice,
      amount,
      sourceRow: row + 1,
      status: !itemName || (quantity === null && unitPrice === null) ? "error" : rowWarnings.length ? "warning" : "valid",
      warnings: rowWarnings,
    });
  }

  if (!items.length) warnings.push("No item rows were found below the header.");

  if (subtotal !== undefined) {
    const summed = items.reduce((total, item) => total + (item.amount ?? (item.quantity ?? 0) * (item.unitPrice ?? 0)), 0);
    if (Math.abs(summed - subtotal) > AMOUNT_TOLERANCE) {
      warnings.push(
        `Item total (${summed.toLocaleString("en-IN")}) does not match the quotation subtotal (${subtotal.toLocaleString("en-IN")}).`
      );
    }
  }

  return {
    ...preamble,
    items,
    subtotal,
    tax,
    grandTotal,
    mapping,
    headers: grid[headerRow] ?? [],
    headerRow,
    warnings,
  };
}

/** Column headers that were present but recognised as nothing, for the mapping UI. */
export function unmappedHeaders(headers: string[], mapping: ColumnMapping): { index: number; header: string }[] {
  const used = new Set(Object.values(mapping));
  return headers
    .map((header, index) => ({ index, header: header.trim() }))
    .filter(({ index, header }) => header !== "" && !used.has(index));
}

export type { ColumnMapping, QuotationField };
