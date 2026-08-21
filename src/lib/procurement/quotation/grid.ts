/**
 * Rebuilds a table grid from positioned words.
 *
 * Digital PDFs and OCR both hand back the same shape — a word plus where it sits
 * on the page — so one reconstruction serves both and there is no second
 * algorithm to keep in step. Nothing here is probabilistic: the same page always
 * produces the same grid.
 */

export type PositionedWord = {
  text: string;
  /** Left edge, in page units. */
  x: number;
  /** Baseline/top, in page units, increasing downwards. */
  y: number;
  width: number;
  height: number;
};

/**
 * Words on one visual line rarely share an exact y, so they are grouped when
 * their baselines fall within a fraction of the line height.
 */
const ROW_TOLERANCE = 0.6;

/** Gaps wider than this multiple of a space are read as a column break. */
const COLUMN_GAP_RATIO = 1.6;

/** Column starts within this many characters of each other are the same column. */
const COLUMN_MERGE_CHARS = 2;

export function groupIntoRows(words: PositionedWord[]): PositionedWord[][] {
  if (!words.length) return [];

  const medianHeight = median(words.map((w) => w.height).filter((h) => h > 0)) || 8;
  const tolerance = medianHeight * ROW_TOLERANCE;

  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PositionedWord[][] = [];
  let current: PositionedWord[] = [];
  let anchor = sorted[0].y;

  for (const word of sorted) {
    if (current.length && Math.abs(word.y - anchor) > tolerance) {
      rows.push(current.sort((a, b) => a.x - b.x));
      current = [];
      anchor = word.y;
    }
    if (!current.length) anchor = word.y;
    current.push(word);
  }
  if (current.length) rows.push(current.sort((a, b) => a.x - b.x));
  return rows;
}

/**
 * Column edges are found from the whole page rather than row by row, because a
 * single row cannot tell a column break from an ordinary wide gap. Every x where
 * some row starts a cell becomes a candidate edge, and nearby candidates merge.
 */
export function findColumnEdges(rows: PositionedWord[][]): number[] {
  const starts: number[] = [];
  const charWidths: number[] = [];

  for (const row of rows) {
    if (!row.length) continue;
    for (const word of row) charWidths.push(word.width / Math.max(word.text.length, 1));
    const spaceWidth = median(row.map((w) => w.width / Math.max(w.text.length, 1))) || 4;
    starts.push(row[0].x);
    for (let i = 1; i < row.length; i++) {
      const gap = row[i].x - (row[i - 1].x + row[i - 1].width);
      if (gap > spaceWidth * COLUMN_GAP_RATIO) starts.push(row[i].x);
    }
  }
  if (!starts.length) return [0];

  starts.sort((a, b) => a - b);
  // Only near-identical x values are the same column. Deriving this from the
  // gaps *between* columns instead — as an earlier version did — scaled the
  // threshold with the column spacing and swallowed whole columns.
  const mergeWithin = (median(charWidths) || 4) * COLUMN_MERGE_CHARS;
  const merged: number[] = [];
  for (const start of starts) {
    if (!merged.length || start - merged[merged.length - 1] > mergeWithin) merged.push(start);
  }
  return merged;
}

/** Assigns each word to the rightmost column edge at or before it. */
export function wordsToGrid(words: PositionedWord[]): string[][] {
  const rows = groupIntoRows(words);
  const edges = findColumnEdges(rows);

  return rows
    .map((row) => {
      const cells: string[] = new Array(edges.length).fill("");
      for (const word of row) {
        let col = 0;
        for (let i = edges.length - 1; i >= 0; i--) {
          // A small slack stops a word that starts a hair left of its edge from
          // falling back into the previous column.
          if (word.x >= edges[i] - word.height * 0.5) { col = i; break; }
        }
        cells[col] = cells[col] ? `${cells[col]} ${word.text}` : word.text;
      }
      return cells.map((c) => c.trim());
    })
    .filter((row) => row.some((cell) => cell !== ""));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
