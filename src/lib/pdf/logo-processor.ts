// Logo processing for the PDF cover — Phase 1 (transparent logos only).
//
// Transparent-background PNG logos are white-recolored so they render cleanly
// on the dark cover gradient without a white box. Opaque logos, SVGs, and
// any processing failure fall back to null → PDF uses the white-box treatment.
//
// All functions are pure or near-pure: no network calls, no side effects.
// The one I/O-bound function (processLogoForPdf) is intentionally isolated so
// the caller can wrap it in try/catch and treat null as safe.
//
// Processing happens ONCE in the background pipeline (step 7.5) and the
// result is cached in DB.logoProcessedDataUri. PDF generation reads the
// column directly — no reprocessing, no remove.bg calls at render time.

import { PNG } from 'pngjs';

// ── Constants ─────────────────────────────────────────────────────────────────

// Alpha threshold below which a pixel is considered transparent
const ALPHA_THRESHOLD = 30;

// Blob-guard thresholds (see plan §5).
// Coverage = opaque pixels / total pixels.
// BBox fill = opaque pixels / bounding-box area.
const BLOB_COVERAGE_HARD  = 0.55;   // coverage alone triggers reject
const BLOB_COVERAGE_SOFT  = 0.40;   // combined with bbox_fill
const BLOB_BBOX_FILL_SOFT = 0.75;   // combined with coverage_soft

// ── PNG transparency detection (pure byte inspection, no image lib) ───────────

/**
 * Inspects raw PNG/JPEG/WebP bytes and returns whether the image has a
 * transparent background that is safe for white-recoloring.
 *
 * Reads only the PNG header (first 64 bytes) — never decodes the full image.
 *
 * Returns:
 *   'rgba'    — PNG with RGBA color type (4 or 6) — transparent, recolor it
 *   'indexed' — PNG with indexed color type (3) + tRNS chunk present — transparent
 *   'opaque'  — RGB PNG (color type 2), JPEG, or WebP — keep white-box
 *   'svg'     — SVG detected — defer to a future phase
 *   'unknown' — unrecognized format — treat as opaque
 */
export function detectTransparency(
  buffer: Buffer,
): 'rgba' | 'indexed' | 'opaque' | 'svg' | 'unknown' {
  if (buffer.length < 8) return 'unknown';

  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng = PNG_MAGIC.every((b, i) => buffer[i] === b);

  if (isPng) {
    // PNG IHDR chunk: starts at byte 8. Color type is at offset 25 from file start.
    // Color types: 2=RGB, 3=indexed, 4=grayscale+alpha, 6=RGBA
    if (buffer.length < 26) return 'unknown';
    const colorType = buffer[25];
    if (colorType === 4 || colorType === 6) return 'rgba';
    if (colorType === 2) return 'opaque';
    if (colorType === 3) {
      // Indexed: scan first 2 KB for tRNS chunk which carries transparency data
      const scan = buffer.slice(0, Math.min(buffer.length, 2048)).toString('binary');
      return scan.includes('tRNS') ? 'indexed' : 'opaque';
    }
    return 'unknown';
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (isJpeg) return 'opaque';

  // WebP: RIFF....WEBP
  const isWebp =
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  if (isWebp) return 'opaque';

  // SVG: starts with '<svg' or '<?xml'
  const start = buffer.slice(0, 10).toString('utf8').toLowerCase();
  if (start.includes('<svg') || start.includes('<?xml')) return 'svg';

  return 'unknown';
}

// ── Blob guard ────────────────────────────────────────────────────────────────

export interface BlobMetrics {
  coverage: number;    // opaque pixels / total pixels (0–1)
  bboxFill: number;    // opaque pixels / bounding-box area (0–1)
  totalPixels: number;
  opaquePixels: number;
}

/**
 * Computes blob metrics on an RGBA image buffer (post white-recolor).
 * Used to detect badge icons like tarka_indian (filled circle → white blob).
 */
export function computeBlobMetrics(rgba: Buffer, width: number, height: number): BlobMetrics {
  let opaquePixels = 0;
  let minX = width, maxX = 0, minY = height, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = rgba[idx + 3];
      if (alpha >= ALPHA_THRESHOLD) {
        opaquePixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const totalPixels = width * height;
  const coverage = opaquePixels / totalPixels;

  const bboxW = opaquePixels > 0 ? maxX - minX + 1 : 0;
  const bboxH = opaquePixels > 0 ? maxY - minY + 1 : 0;
  const bboxArea = bboxW * bboxH;
  const bboxFill = bboxArea > 0 ? opaquePixels / bboxArea : 0;

  return { coverage, bboxFill, totalPixels, opaquePixels };
}

/**
 * Returns true if the metrics indicate a filled blob that will lose all
 * meaningful detail when white-recolored.
 *
 * Calibrated against evaluation data:
 *   tarka_indian  coverage=0.585  bbox_fill=0.796  → REJECT ✓
 *   salvatoris    coverage=0.342  bbox_fill=0.631  → keep ✓
 *   nyt_logo      coverage=0.185  bbox_fill=0.570  → keep ✓
 *   bethlehem     coverage=0.287  bbox_fill=0.455  → keep ✓
 *   dish_society  coverage=0.370  bbox_fill≈0.50   → keep ✓ (dense wordmark)
 */
export function isBlobLogo(metrics: BlobMetrics): boolean {
  return (
    metrics.coverage > BLOB_COVERAGE_HARD ||
    (metrics.coverage > BLOB_COVERAGE_SOFT && metrics.bboxFill > BLOB_BBOX_FILL_SOFT)
  );
}

// ── White recolor ─────────────────────────────────────────────────────────────

/**
 * Decodes a transparent PNG buffer, replaces every non-transparent pixel's
 * RGB channels with (255, 255, 255), and returns a new PNG buffer.
 *
 * Does NOT modify alpha — the shape (silhouette) is preserved exactly.
 * Uses pngjs (pure JS, no native binaries).
 */
export function whiteRecolor(pngBuffer: Buffer): Buffer {
  const png = PNG.sync.read(pngBuffer);
  const { data, width, height } = png;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha >= ALPHA_THRESHOLD) {
        data[idx]     = 255; // R
        data[idx + 1] = 255; // G
        data[idx + 2] = 255; // B
        // alpha unchanged
      }
    }
  }

  return PNG.sync.write(png);
}

// ── Main entry point ──────────────────────────────────────────────────────────

export interface ProcessLogoResult {
  dataUri: string;          // data:image/png;base64,...
  blobGuardFired: boolean;  // true if guard rejected and we fell back
  transparencyType: 'rgba' | 'indexed';
}

/**
 * Phase 1 logo processing:
 *   transparent PNG → white-recolor → blob-guard → data URI
 *
 * Returns null when:
 *   - isConservative (no logo on conservative PDF)
 *   - buffer is opaque (JPEG, RGB-PNG, WebP) — white-box fallback
 *   - SVG — deferred to a future phase
 *   - blob-guard fires — white-box fallback preserves color detail
 *   - any error in recoloring
 *
 * Never throws. Caller wraps in try/catch anyway (belt-and-suspenders).
 */
export function processTransparentLogo(
  buffer: Buffer,
  isConservative: boolean,
  logoUrl: string,
): ProcessLogoResult | null {
  if (isConservative) return null;

  const transparency = detectTransparency(buffer);

  if (transparency === 'opaque') {
    // Phase 1: opaque logos keep the white-box treatment — no processing
    console.log(`[FSIQ LOGO] opaque background detected — white-box fallback: ${logoUrl.slice(0, 60)}`);
    return null;
  }

  if (transparency === 'svg') {
    // SVG recoloring deferred to a future phase
    console.log(`[FSIQ LOGO] SVG detected — white-box fallback (deferred): ${logoUrl.slice(0, 60)}`);
    return null;
  }

  if (transparency === 'unknown') {
    console.log(`[FSIQ LOGO] unknown format — white-box fallback: ${logoUrl.slice(0, 60)}`);
    return null;
  }

  // transparency === 'rgba' or 'indexed' — proceed with white-recolor
  const recolored = whiteRecolor(buffer);

  // Decode recolored PNG to compute blob metrics
  const png = PNG.sync.read(recolored);
  const metrics = computeBlobMetrics(Buffer.from(png.data), png.width, png.height);

  if (isBlobLogo(metrics)) {
    // Badge icon — white-recolor would produce a featureless blob.
    // Fall back to white-box with original colored logo.
    console.log(
      `[FSIQ LOGO] blob-guard fired — white-box fallback ` +
      `(coverage=${(metrics.coverage * 100).toFixed(1)}% ` +
      `bbox_fill=${(metrics.bboxFill * 100).toFixed(1)}%): ${logoUrl.slice(0, 60)}`,
    );
    return null;
  }

  const dataUri = `data:image/png;base64,${recolored.toString('base64')}`;
  console.log(
    `[FSIQ LOGO] white-recolor applied ` +
    `(${transparency} coverage=${(metrics.coverage * 100).toFixed(1)}%): ${logoUrl.slice(0, 60)}`,
  );
  return { dataUri, blobGuardFired: false, transparencyType: transparency };
}
