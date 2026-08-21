/**
 * File → grids. One grid per sheet, per table, or per document.
 *
 * Everything runs in the browser: the quotation never reaches a server, so there
 * are no temporary files to secure or delete and the feature works offline once
 * the dependencies are installed. Each parser is dynamically imported, so none of
 * it — least of all the tesseract WASM — lands in the main bundle.
 *
 * OCR is a fallback, never the default: a PDF is only rasterised when it has no
 * usable text layer.
 */

import { wordsToGrid, type PositionedWord } from "./grid";

export type QuotationSource = {
  /** "Sheet1", "Page 1", "Table 2" — shown when the user must pick between tables. */
  label: string;
  grid: string[][];
  fromOcr: boolean;
};

export const QUOTATION_ACCEPT = ".xlsx,.xls,.csv,.pdf,.docx,.jpg,.jpeg,.png,.webp";

const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls", "csv", "pdf", "docx", "jpg", "jpeg", "png", "webp"]);

/** Big enough for a 200-item quotation, small enough to refuse a zip bomb. */
export const MAX_QUOTATION_BYTES = 15 * 1024 * 1024;

/** Caps on what a single file may expand to, so a crafted archive cannot exhaust memory. */
const MAX_ROWS = 5000;
const MAX_COLUMNS = 60;
const MAX_PDF_PAGES = 30;
const MAX_DOCX_XML_BYTES = 40 * 1024 * 1024;

/** Below these, OCR output is not worth parsing and the user needs telling. */
const OCR_MIN_CONFIDENCE = 55;
const OCR_MIN_CHARS = 40;

/** A PDF page with fewer characters than this is treated as scanned, not digital. */
const PDF_TEXT_THRESHOLD = 60;

export type ProgressReporter = (stage: string) => void;

const extOf = (name: string) => (name.split(".").pop() || "").toLowerCase();

/** ExcelJS cell values are unions — formulas, rich text, dates, hyperlinks. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Formula cells: take the cached result Excel last calculated. The formula
    // itself is never evaluated — no workbook code runs here.
    if ("result" in v) return cellText(v.result);
    if ("text" in v) return cellText(v.text);
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((r: any) => r?.text ?? "").join("");
    if ("hyperlink" in v && "text" in v) return cellText(v.text);
    return "";
  }
  return String(value).trim();
}

/** Minimal RFC4180 split — quoted fields may contain commas, newlines and "" escapes. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field.trim()); field = ""; }
    else if (ch === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows.slice(0, MAX_ROWS);
}

/**
 * Pulls each `<w:tbl>` out of a Word document as its own grid, and the body text
 * as one more. Quotations are usually tables, but some vendors lay items out as
 * tab-separated paragraphs, which the text grid still catches.
 */
export function docxToGrids(xml: string): { tables: string[][][]; text: string[][] } {
  const tables: string[][][] = [];

  for (const table of xml.match(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g) ?? []) {
    const grid = (table.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? []).map((row) =>
      (row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) ?? []).map((c) => stripXml(c)).slice(0, MAX_COLUMNS)
    );
    if (grid.length) tables.push(grid.slice(0, MAX_ROWS));
  }

  const body = xml.replace(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g, "");
  const text = stripXml(body, "\n")
    .split("\n")
    .map((line) => line.split("\t").map((c) => c.trim()))
    .filter((row) => row.some((c) => c !== ""))
    .slice(0, MAX_ROWS);

  return { tables, text };
}

function stripXml(xml: string, paragraphSeparator = " "): string {
  return xml
    .replace(/<\/w:p>/g, paragraphSeparator)
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, paragraphSeparator)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[  ]+/g, " ")
    .trim();
}

export function isUsableOcr(text: string, confidence: number): boolean {
  return confidence >= OCR_MIN_CONFIDENCE && text.length >= OCR_MIN_CHARS && /\d/.test(text);
}

async function readExcel(file: File): Promise<QuotationSource[]> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  return workbook.worksheets.map((sheet) => {
    const grid: string[][] = [];
    const columnCount = Math.min(sheet.columnCount || 1, MAX_COLUMNS);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (grid.length >= MAX_ROWS) return;
      const cells: string[] = [];
      // ExcelJS is 1-indexed and drops trailing empties; walking by count keeps
      // every row's column positions aligned with the header's.
      for (let c = 1; c <= columnCount; c++) cells.push(cellText(row.getCell(c).value));
      if (cells.some((c) => c !== "")) grid.push(cells);
    });
    return { label: sheet.name || `Sheet ${sheet.id}`, grid, fromOcr: false };
  }).filter((source) => source.grid.length > 0);
}

async function readDocx(file: File): Promise<QuotationSource[]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("That .docx has no readable document body");
  // An unzipped entry far larger than any real document is a decompression bomb.
  if (doc.length > MAX_DOCX_XML_BYTES) throw new Error("That document is too large to read");

  const { tables, text } = docxToGrids(strFromU8(doc));
  const sources: QuotationSource[] = tables.map((grid, i) => ({
    label: tables.length > 1 ? `Table ${i + 1}` : "Document table",
    grid,
    fromOcr: false,
  }));
  if (text.length) sources.push({ label: "Document text", grid: text, fromOcr: false });
  return sources;
}

/** Renders one PDF page to a canvas so tesseract can read it. */
async function pageToImage(page: any): Promise<HTMLCanvasElement> {
  // 2x gives tesseract roughly 150-200 DPI on a typical A4 page — enough to read
  // without the memory cost of rendering everything at 300.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not render the PDF page");
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return canvas;
}

async function readPdf(file: File, onProgress?: ProgressReporter): Promise<QuotationSource[]> {
  const pdfjs = await import("pdfjs-dist");
  // Self-hosted worker: no CDN, so this keeps working without internet access.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";

  // Parsing runs inside the pdf.js worker, so a malformed file fails there
  // rather than taking the page down with it.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableAutoFetch: true,
  });
  const doc = await loadingTask.promise;

  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  const digital: PositionedWord[] = [];
  const scannedPages: number[] = [];
  let yOffset = 0;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    const characters = content.items.reduce((n: number, item: any) => n + (item.str?.trim().length ?? 0), 0);
    if (characters < PDF_TEXT_THRESHOLD) {
      scannedPages.push(pageNumber);
      continue;
    }

    for (const item of content.items as any[]) {
      const text = (item.str ?? "").trim();
      if (!text) continue;
      // PDF y grows upwards; flipping it lets one row-grouping rule serve both
      // PDF and OCR. Stacking pages keeps a table that continues onto page 2
      // in the same grid as its header.
      digital.push({
        text,
        x: item.transform[4],
        y: yOffset + (viewport.height - item.transform[5]),
        width: item.width || text.length * 4,
        height: item.height || 8,
      });
    }
    yOffset += viewport.height;
  }

  const sources: QuotationSource[] = [];
  if (digital.length) {
    sources.push({ label: "PDF text", grid: wordsToGrid(digital).slice(0, MAX_ROWS), fromOcr: false });
  }

  // Only pages with no usable text layer are rasterised and OCR'd.
  if (scannedPages.length) {
    onProgress?.(`Scanned PDF — reading ${scannedPages.length} page${scannedPages.length === 1 ? "" : "s"} with OCR`);
    const words: PositionedWord[] = [];
    let ocrOffset = 0;
    for (const pageNumber of scannedPages) {
      const canvas = await pageToImage(await doc.getPage(pageNumber));
      const { words: pageWords, height } = await ocrWords(canvas, onProgress);
      for (const word of pageWords) words.push({ ...word, y: word.y + ocrOffset });
      ocrOffset += height;
      // Release the rendered page immediately rather than holding every page's
      // bitmap until the document is done.
      canvas.width = 0;
      canvas.height = 0;
    }
    if (words.length) sources.push({ label: "Scanned pages", grid: wordsToGrid(words).slice(0, MAX_ROWS), fromOcr: true });
  }

  await loadingTask.destroy();
  if (!sources.length) throw new Error("Nothing could be read from that PDF");
  return sources;
}

async function ocrWords(
  image: HTMLCanvasElement | File,
  onProgress?: ProgressReporter
): Promise<{ words: PositionedWord[]; height: number; text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    // Self-hosted so OCR works with no internet access. See public/tesseract.
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract",
    langPath: "/tesseract/lang",
  });
  try {
    onProgress?.("Reading text");
    const { data } = await worker.recognize(image, {}, { blocks: true });
    const words: PositionedWord[] = [];
    let height = 0;
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            const box = word.bbox;
            words.push({
              text: word.text,
              x: box.x0,
              y: box.y0,
              width: box.x1 - box.x0,
              height: box.y1 - box.y0,
            });
            height = Math.max(height, box.y1);
          }
        }
      }
    }
    return { words, height: height + 20, text: (data.text || "").trim(), confidence: data.confidence ?? 0 };
  } finally {
    await worker.terminate();
  }
}

async function readImage(file: File, onProgress?: ProgressReporter): Promise<QuotationSource[]> {
  // createImageBitmap applies EXIF orientation, so a photo taken sideways is
  // uprighted before OCR instead of producing gibberish.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();

  const { words, text, confidence } = await ocrWords(canvas, onProgress);
  canvas.width = 0;
  canvas.height = 0;

  if (!isUsableOcr(text, confidence)) {
    throw new Error(
      "That image could not be read clearly. Try a straighter, better-lit photo, or upload the Excel or PDF version."
    );
  }
  return [{ label: "Photo", grid: wordsToGrid(words).slice(0, MAX_ROWS), fromOcr: true }];
}

/** Validates the file, then returns every candidate table it contains. */
export async function readQuotationFile(file: File, onProgress?: ProgressReporter): Promise<QuotationSource[]> {
  const ext = extOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("Upload an Excel, PDF, Word or image file");
  }
  if (file.size === 0) throw new Error("That file is empty");
  if (file.size > MAX_QUOTATION_BYTES) {
    throw new Error(`File is too large (max ${MAX_QUOTATION_BYTES / 1024 / 1024}MB)`);
  }

  onProgress?.("Reading quotation");

  if (ext === "csv") return [{ label: "CSV", grid: parseCsv(await file.text()), fromOcr: false }];
  if (ext === "xlsx" || ext === "xls") return readExcel(file);
  if (ext === "docx") return readDocx(file);
  if (ext === "pdf") return readPdf(file, onProgress);
  return readImage(file, onProgress);
}
