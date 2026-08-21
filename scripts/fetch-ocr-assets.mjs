/**
 * Stages the PDF and OCR worker assets into public/ so quotation parsing runs
 * entirely in the browser with no CDN — which is what lets it work offline.
 *
 * These are large binaries, so they are generated rather than committed. Every
 * byte comes from node_modules, pinned by the lockfile: no network is used, so
 * a build produces the same assets on any machine, including an air-gapped one.
 *
 * Runs from both `postinstall` and `build`. The second is not redundant — a
 * build that restores a cached node_modules can skip install entirely, and then
 * public/ would be empty. It is safe to re-run and skips work already done.
 *
 *   node scripts/fetch-ocr-assets.mjs
 */

import { createRequire } from "node:module";
import { mkdir, copyFile, access, readdir } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const PUBLIC = path.resolve("public");

// Only the variants tesseract.js actually selects: SIMD where the browser has
// it, plain LSTM as the fallback. The non-LSTM ("legacy") cores are twice the
// size and unused, so they are deliberately not staged.
const CORE_VARIANTS = ["tesseract-core-simd-lstm", "tesseract-core-lstm"];

const LANG = "eng";
// "best_int" is the accurate integer-quantised model (~3MB); the plain 4.0.0
// build is faster but ~10MB and reads rate tables noticeably worse.
const LANG_VARIANT = "4.0.0_best_int";

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
  if (await stage(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"), pdfDir)) staged++;

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

  // Language data, from the @tesseract.js-data/eng package rather than a CDN.
  const langDir = path.join(tessDir, "lang");
  await mkdir(langDir, { recursive: true });
  const langPackage = path.dirname(require.resolve(`@tesseract.js-data/${LANG}/package.json`));
  if (await stage(path.join(langPackage, LANG_VARIANT, `${LANG}.traineddata.gz`), langDir)) staged++;

  console.log(staged ? `[ocr-assets] staged ${staged} file(s) into public/` : "[ocr-assets] already up to date");
}

main().catch((error) => {
  // Fails the build deliberately. Every input is a pinned dependency, so a
  // failure here means the install is genuinely broken — and shipping instead
  // would leave quotation OCR silently dead in production, which is far harder
  // to diagnose than a build that stops and says why.
  console.error(`[ocr-assets] FAILED: ${error.message}`);
  console.error("[ocr-assets] Quotation OCR needs these assets. Run `pnpm install` and retry.");
  process.exit(1);
});
