/**
 * The entry point: a file in, candidate quotations out.
 *
 * A workbook may hold a Quote sheet, a Terms sheet and a Product Data sheet; a
 * Word file may hold a bank-details table beside the item table. Each candidate
 * is parsed and scored by the same rules, the strongest is offered first, and any
 * genuine rival is kept so the user can switch sheets rather than start again.
 */

import { parseQuotationGrid, type ExtractedQuotation, type ParseOptions } from "./parse";
import { readQuotationFile, type ProgressReporter, type QuotationSource } from "./sources";

export type QuotationCandidate = ExtractedQuotation & {
  label: string;
  fromOcr: boolean;
  /** Higher is more likely to be the item table. */
  score: number;
  /** Kept so correcting a column can re-parse without re-reading the file. */
  grid: string[][];
};

export type QuotationExtraction = {
  best: QuotationCandidate;
  /** Every candidate with items, best first — drives the sheet/table picker. */
  candidates: QuotationCandidate[];
};

/**
 * Scores a parsed candidate. Item count dominates because a real item table has
 * many rows and a bank-details table has three; clean rows count for more than
 * broken ones, so a well-read table beats a mangled one of the same size.
 */
function scoreCandidate(quotation: ExtractedQuotation, source: QuotationSource): number {
  if (!quotation.items.length) return 0;

  const usable = quotation.items.filter((item) => item.status !== "error").length;
  const priced = quotation.items.filter((item) => item.unitPrice !== null).length;

  let score = usable * 3 + priced * 2 + Math.min(quotation.items.length, 50);
  if (quotation.mapping.quantity !== undefined && quotation.mapping.unitPrice !== undefined) score += 15;
  if (quotation.mapping.amount !== undefined) score += 5;
  // OCR is a fallback: given a digital table and a scanned one, prefer the digital.
  if (source.fromOcr) score -= 10;
  return score;
}

export async function extractQuotation(
  file: File,
  options: ParseOptions & { onProgress?: ProgressReporter } = {}
): Promise<QuotationExtraction> {
  const { onProgress, ...parseOptions } = options;

  const sources = await readQuotationFile(file, onProgress);
  onProgress?.("Detecting item table");

  const candidates = sources
    .map((source) => {
      const quotation = parseQuotationGrid(source.grid, { ...parseOptions, fromOcr: source.fromOcr });
      return {
        ...quotation,
        label: source.label,
        fromOcr: source.fromOcr,
        grid: source.grid,
        score: scoreCandidate(quotation, source),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    throw new Error("No item table could be found in that file. Check the file, or enter the items manually.");
  }

  const best = candidates[0];
  onProgress?.(`Extracting ${best.items.length} item${best.items.length === 1 ? "" : "s"}`);

  // A close second means the choice was not clear-cut and the user should know.
  if (candidates.length > 1 && candidates[1].score > best.score * 0.75) {
    best.warnings = [...best.warnings, `Multiple possible item tables found — showing "${best.label}".`];
  }

  return { best, candidates };
}

export * from "./columns";
export * from "./parse";
export { readQuotationFile, QUOTATION_ACCEPT, MAX_QUOTATION_BYTES } from "./sources";
export type { QuotationSource, ProgressReporter } from "./sources";
