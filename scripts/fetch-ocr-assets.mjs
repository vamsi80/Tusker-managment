/**
 * Stages the PDF and OCR worker assets into public/ so quotation parsing runs
 * entirely in the browser with no CDN — which is what lets it work offline.
 *
 * These are large binaries, so they are generated rather than committed. Runs on
 * postinstall; safe to re-run, and skips work that is already done.
 *
 *   node scripts/fetch-ocr-assets.mjs
 */

import { createRequire } from "node:module";
import { mkdir, copyFile, access, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const PUBLIC = path.resolve("public");

// Only the variants tesseract.js actually selects: SIMD where the browser has it,
// plain LSTM as the fallback. The non-LSTM ("legacy") cores are twice the size
// and unused, so they are deliberately not staged.
const CORE_VARIANTS = ["tesseract-core-simd-lstm", "tesseract-core-lstm"];

const LANG = "eng";
const LANG_URL = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${LANG}@1.0.0/4.0.0_best_int/${LANG}.traineddata.gz`;

const exists = (p) => access(p).then(() => true, () => false);

async function stage(from, toDir, name) {
  const target = path.join(toDir, name ?? path.basename(from));
  if (await exists(target)) return false;
  await copyFile(from, target);
  return true;
}

async function main() {
  let staged = 0;

  // pdf.js worker
  const pdfDir = path.join(PUBLIC, "pdf");
  await mkdir(pdfDir, { recursive: true });
  const pdfWorker = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
  if (await stage(pdfWorker, pdfDir)) staged++;

  // tesseract worker + wasm cores
  const tessDir = path.join(PUBLIC, "tesseract");
  await mkdir(tessDir, { recursive: true });
  if (await stage(require.resolve("tesseract.js/dist/worker.min.js"), tessDir)) staged++;

  // Resolved *through* tesseract.js rather than from the project root: the core
  // is a transitive dependency, and pinning it directly would let the two drift
  // to incompatible versions.
  const tesseractDir = path.dirname(require.resolve("tesseract.js/package.json"));
  const coreRequire = createRequire(path.join(tesseractDir, "package.json"));
  const coreDir = path.dirname(coreRequire.resolve("tesseract.js-core/package.json"));
  const available = await readdir(coreDir);
  for (const variant of CORE_VARIANTS) {
    for (const file of available.filter((f) => f.startsWith(variant) && /\.wasm(\.js)?$/.test(f))) {
      if (await stage(path.join(coreDir, file), tessDir)) staged++;
    }
  }

  // Language data. The only piece not already in node_modules, so it is the one
  // step that needs network — once.
  const langDir = path.join(tessDir, "lang");
  await mkdir(langDir, { recursive: true });
  const langFile = path.join(langDir, `${LANG}.traineddata.gz`);
  if (!(await exists(langFile))) {
    const res = await fetch(LANG_URL);
    if (!res.ok) throw new Error(`Could not download ${LANG}.traineddata.gz (${res.status})`);
    await writeFile(langFile, Buffer.from(await res.arrayBuffer()));
    staged++;
  }

  console.log(staged ? `[ocr-assets] staged ${staged} file(s) into public/` : "[ocr-assets] already up to date");
}

main().catch((error) => {
  // A failure here disables quotation OCR but must never break install or build;
  // the upload surfaces a clear message if the assets are missing.
  console.warn(`[ocr-assets] skipped: ${error.message}`);
});
