// Unit tests for logo-processor.ts
// Tests: transparency detection, white-recolor correctness, blob-guard thresholds,
// and the conditional logoProcessed flag logic.
// No network calls — all pixel data synthesised in tests.

import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
  detectTransparency,
  computeBlobMetrics,
  isBlobLogo,
  whiteRecolor,
  processTransparentLogo,
} from '../pdf/logo-processor';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal valid PNG header with the specified color type. */
function makePngHeader(colorType: number): Buffer {
  // PNG magic (8) + IHDR length (4) + "IHDR" (4) + w(4)+h(4)+bit-depth(1)+color-type(1)+...
  const buf = Buffer.alloc(64);
  // PNG signature
  buf.write('\x89PNG\r\n\x1a\n', 0, 'binary');
  // IHDR chunk
  buf.writeUInt32BE(13, 8);                   // chunk length
  buf.write('IHDR', 12, 'ascii');             // chunk type
  buf.writeUInt32BE(100, 16);                 // width
  buf.writeUInt32BE(100, 20);                 // height
  buf[24] = 8;                                // bit depth
  buf[25] = colorType;                        // color type
  return buf;
}

/** Make a minimal RGBA PNG buffer with a white transparent background and a
 *  colored central square — gives control over coverage and ink. */
function makeRgbaPng(
  size: number,
  centerColor: [number, number, number],
  centerFraction: number, // 0-1: fraction of width/height covered by center square
): Buffer {
  const png = new PNG({ width: size, height: size });
  const half = Math.floor(size / 2);
  const r = Math.floor((size * centerFraction) / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const inCenter = Math.abs(x - half) <= r && Math.abs(y - half) <= r;
      if (inCenter) {
        png.data[idx]     = centerColor[0];
        png.data[idx + 1] = centerColor[1];
        png.data[idx + 2] = centerColor[2];
        png.data[idx + 3] = 255;
      } else {
        // transparent
        png.data[idx]     = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      }
    }
  }

  return PNG.sync.write(png);
}

// ── detectTransparency ────────────────────────────────────────────────────────

describe('detectTransparency', () => {
  it('returns rgba for PNG color type 6 (RGBA)', () => {
    expect(detectTransparency(makePngHeader(6))).toBe('rgba');
  });

  it('returns rgba for PNG color type 4 (grayscale+alpha)', () => {
    expect(detectTransparency(makePngHeader(4))).toBe('rgba');
  });

  it('returns opaque for PNG color type 2 (RGB)', () => {
    expect(detectTransparency(makePngHeader(2))).toBe('opaque');
  });

  it('returns opaque for PNG color type 3 (indexed) without tRNS chunk', () => {
    // No tRNS chunk in this buffer
    expect(detectTransparency(makePngHeader(3))).toBe('opaque');
  });

  it('returns indexed for PNG color type 3 with tRNS chunk in first 2KB', () => {
    const buf = Buffer.alloc(64);
    makePngHeader(3).copy(buf);
    // Inject tRNS at position 30
    buf.write('tRNS', 30, 'ascii');
    expect(detectTransparency(buf)).toBe('indexed');
  });

  it('returns opaque for JPEG (\\xFF\\xD8\\xFF magic)', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(detectTransparency(buf)).toBe('opaque');
  });

  it('returns opaque for WebP (RIFF....WEBP magic)', () => {
    const buf = Buffer.alloc(16);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(1000, 4);
    buf.write('WEBP', 8, 'ascii');
    expect(detectTransparency(buf)).toBe('opaque');
  });

  it('returns svg for SVG starting with <svg', () => {
    const buf = Buffer.from('<svg xmlns=');
    expect(detectTransparency(buf)).toBe('svg');
  });

  it('returns svg for SVG starting with <?xml', () => {
    const buf = Buffer.from('<?xml version');
    expect(detectTransparency(buf)).toBe('svg');
  });

  it('returns unknown for buffer shorter than 8 bytes', () => {
    expect(detectTransparency(Buffer.from([0x89, 0x50]))).toBe('unknown');
  });

  it('returns unknown for unrecognised format', () => {
    expect(detectTransparency(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]))).toBe('unknown');
  });
});

// ── whiteRecolor ──────────────────────────────────────────────────────────────

describe('whiteRecolor', () => {
  it('replaces opaque pixel RGB with 255,255,255', () => {
    // Create a 2×2 RGBA PNG: one opaque red pixel, three transparent
    const png = new PNG({ width: 2, height: 2 });
    // Pixel (0,0): opaque red
    png.data[0] = 200; png.data[1] = 50; png.data[2] = 50; png.data[3] = 255;
    // Pixel (1,0): transparent
    png.data[4] = 0; png.data[5] = 0; png.data[6] = 0; png.data[7] = 0;
    // Pixel (0,1): transparent
    png.data[8] = 0; png.data[9] = 0; png.data[10] = 0; png.data[11] = 0;
    // Pixel (1,1): opaque blue
    png.data[12] = 0; png.data[13] = 0; png.data[14] = 200; png.data[15] = 255;
    const input = PNG.sync.write(png);

    const result = PNG.sync.read(whiteRecolor(input));
    // (0,0) red → white
    expect(result.data[0]).toBe(255);
    expect(result.data[1]).toBe(255);
    expect(result.data[2]).toBe(255);
    expect(result.data[3]).toBe(255); // alpha preserved
    // (1,0) transparent → unchanged
    expect(result.data[7]).toBe(0);   // alpha still 0
    // (1,1) blue → white
    expect(result.data[12]).toBe(255);
    expect(result.data[13]).toBe(255);
    expect(result.data[14]).toBe(255);
    expect(result.data[15]).toBe(255);
  });

  it('preserves alpha channel exactly', () => {
    const png = new PNG({ width: 1, height: 1 });
    png.data[0] = 100; png.data[1] = 100; png.data[2] = 100; png.data[3] = 128; // semi-transparent
    const result = PNG.sync.read(whiteRecolor(PNG.sync.write(png)));
    expect(result.data[3]).toBe(128); // alpha unchanged
    expect(result.data[0]).toBe(255); // RGB → white
  });

  it('leaves fully transparent pixels unchanged', () => {
    const png = new PNG({ width: 1, height: 1 });
    png.data[0] = 200; png.data[1] = 100; png.data[2] = 50; png.data[3] = 0; // alpha=0
    const result = PNG.sync.read(whiteRecolor(PNG.sync.write(png)));
    // Below ALPHA_THRESHOLD (30), RGB not recolored
    expect(result.data[3]).toBe(0);
  });
});

// ── computeBlobMetrics / isBlobLogo ────────────────────────────────────────────

describe('blob guard', () => {
  /** Create a filled-circle image (simulates tarka_indian badge icon). */
  function makeFilledCircleRgba(size: number, radius: number): Buffer {
    const data = Buffer.alloc(size * size * 4, 0);
    const cx = size / 2, cy = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const inCircle = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
        if (inCircle) {
          data[idx] = 255; data[idx + 1] = 100; data[idx + 2] = 0; data[idx + 3] = 255;
        }
      }
    }
    return data;
  }

  /** Create a thin horizontal wordmark (simulates dish_society). */
  function makeWordmarkRgba(w: number, h: number, strokeHeight: number): Buffer {
    const data = Buffer.alloc(w * h * 4, 0);
    const midY = Math.floor(h / 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const inStroke = Math.abs(y - midY) <= strokeHeight / 2;
        // Add some gaps for letterforms (every 4th column)
        const inLetter = inStroke && x % 8 < 6;
        if (inLetter) {
          data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
        }
      }
    }
    return data;
  }

  it('rejects a large filled circle (coverage=58%, tarka case)', () => {
    const size = 180;
    const rgba = makeFilledCircleRgba(size, 80); // large circle ≈ 62% coverage
    const metrics = computeBlobMetrics(rgba, size, size);
    expect(metrics.coverage).toBeGreaterThan(0.55);
    expect(isBlobLogo(metrics)).toBe(true);
  });

  it('accepts a horizontal wordmark at ~37% coverage (dish_society case)', () => {
    // Simulated wordmark: 666×128, stroke covering ~37% of total area
    const w = 666, h = 128;
    const rgba = makeWordmarkRgba(w, h, 30); // thin horizontal stroke
    const metrics = computeBlobMetrics(rgba, w, h);
    // Coverage should be well below 55% and bbox_fill below 75%
    expect(metrics.coverage).toBeLessThan(0.55);
    expect(isBlobLogo(metrics)).toBe(false);
  });

  it('accepts a small icon at 28% coverage (bethlehem case)', () => {
    // Letter B icon: ~28% coverage, high bbox_fill but coverage below threshold
    const buf = makeRgbaPng(144, [0, 0, 0], 0.53); // center square, ~28% of total
    const png = PNG.sync.read(buf);
    const metrics = computeBlobMetrics(Buffer.from(png.data), png.width, png.height);
    expect(metrics.coverage).toBeLessThan(0.55);
    expect(isBlobLogo(metrics)).toBe(false);
  });

  it('hard threshold: coverage > 55% always rejects regardless of bbox_fill', () => {
    const metrics = { coverage: 0.56, bboxFill: 0.40, totalPixels: 1000, opaquePixels: 560 };
    expect(isBlobLogo(metrics)).toBe(true);
  });

  it('soft threshold: coverage > 40% AND bbox_fill > 75% rejects', () => {
    const metrics = { coverage: 0.45, bboxFill: 0.80, totalPixels: 1000, opaquePixels: 450 };
    expect(isBlobLogo(metrics)).toBe(true);
  });

  it('soft threshold: coverage > 40% but bbox_fill <= 75% does NOT reject', () => {
    const metrics = { coverage: 0.45, bboxFill: 0.70, totalPixels: 1000, opaquePixels: 450 };
    expect(isBlobLogo(metrics)).toBe(false);
  });

  it('bboxFill of zero when no opaque pixels', () => {
    const rgba = Buffer.alloc(100 * 100 * 4, 0);
    const metrics = computeBlobMetrics(rgba, 100, 100);
    expect(metrics.opaquePixels).toBe(0);
    expect(metrics.bboxFill).toBe(0);
    expect(isBlobLogo(metrics)).toBe(false);
  });
});

// ── processTransparentLogo ────────────────────────────────────────────────────

describe('processTransparentLogo', () => {
  const LOGO_URL = 'https://example.com/logo.png';

  it('returns null immediately for conservative mode', () => {
    const buf = makeRgbaPng(100, [255, 0, 0], 0.3);
    expect(processTransparentLogo(buf, true, LOGO_URL)).toBeNull();
  });

  it('returns null for JPEG (opaque)', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(processTransparentLogo(buf, false, LOGO_URL)).toBeNull();
  });

  it('returns null for SVG (deferred)', () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(processTransparentLogo(buf, false, LOGO_URL)).toBeNull();
  });

  it('processes an RGBA PNG and returns a white data URI', () => {
    // 50×50 PNG with a red center square (~36% opaque) — should pass blob guard
    const buf = makeRgbaPng(50, [200, 50, 50], 0.6);
    const result = processTransparentLogo(buf, false, LOGO_URL);
    expect(result).not.toBeNull();
    expect(result!.dataUri).toMatch(/^data:image\/png;base64,/);
    expect(result!.blobGuardFired).toBe(false);
    expect(result!.transparencyType).toBe('rgba');

    // Verify the output is actually white — decode and sample the center pixel
    const decoded = PNG.sync.read(Buffer.from(result!.dataUri.split(',')[1], 'base64'));
    const cx = Math.floor(decoded.width / 2), cy = Math.floor(decoded.height / 2);
    const idx = (cy * decoded.width + cx) * 4;
    expect(decoded.data[idx]).toBe(255);     // R = 255
    expect(decoded.data[idx + 1]).toBe(255); // G = 255
    expect(decoded.data[idx + 2]).toBe(255); // B = 255
    // Alpha preserved (opaque center)
    expect(decoded.data[idx + 3]).toBe(255);
  });

  it('returns null when blob-guard fires (large filled circle)', () => {
    // Build a 100×100 circle covering ~77% of area — above BLOB_COVERAGE_HARD
    const png = new PNG({ width: 100, height: 100 });
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const idx = (y * 100 + x) * 4;
        const inCircle = (x - 50) ** 2 + (y - 50) ** 2 <= 48 ** 2; // large radius
        if (inCircle) {
          png.data[idx] = 255; png.data[idx + 1] = 100; png.data[idx + 2] = 0; png.data[idx + 3] = 255;
        }
      }
    }
    const buf = PNG.sync.write(png);
    const result = processTransparentLogo(buf, false, LOGO_URL);
    expect(result).toBeNull();
  });
});

// ── logoProcessed flag logic (conditional white-box) ─────────────────────────

describe('logoProcessed conditional-box flag', () => {
  // Verify that buildPdfPayload correctly sets logoProcessed based on processedUri presence
  it('logoProcessed = true when logoProcessedDataUri is non-null and logo present', async () => {
    const { buildPdfPayload } = await import('../pdf/build-pdf-payload');
    const input = {
      restaurantName: 'Test', fullName: 'Test User', conceptType: 'Casual dining',
      locations: 'Single location', annualSpend: 1_500_000, spendBucket: '$1M–$3M',
      finalPctDisplay: '5%', dollarEstimateDisplay: '$75,000', dollarEstimate: 75000,
      caseStudy: "MaryAnn's Diner",
      year1: 75000, year2: 77925, year3: 80966, year4: 84123, year5: 87404,
      projectionHeights: { year1: 86, year2: 89, year3: 93, year4: 96, year5: 100 },
      logoUrl: 'https://example.com/logo.png',
      logoProcessedDataUri: 'data:image/png;base64,abc123',
      businessSummary: 'Test.', narrativeDistributor: 'D.', narrativeProcurement: 'P.', narrativeSku: 'S.',
      mode: 'full' as const,
    };
    const payload = buildPdfPayload(input);
    expect(payload.logoProcessed).toBe(true);
    expect(payload.hasLogo).toBe(true);
    // logoUrl should be the processed data URI
    expect(payload.logoUrl).toBe('data:image/png;base64,abc123');
  });

  it('logoProcessed = false when logoProcessedDataUri is null (white-box fallback)', async () => {
    const { buildPdfPayload } = await import('../pdf/build-pdf-payload');
    const input = {
      restaurantName: 'Test', fullName: 'Test User', conceptType: 'Casual dining',
      locations: 'Single location', annualSpend: 1_500_000, spendBucket: '$1M–$3M',
      finalPctDisplay: '5%', dollarEstimateDisplay: '$75,000', dollarEstimate: 75000,
      caseStudy: "MaryAnn's Diner",
      year1: 75000, year2: 77925, year3: 80966, year4: 84123, year5: 87404,
      projectionHeights: { year1: 86, year2: 89, year3: 93, year4: 96, year5: 100 },
      logoUrl: 'https://example.com/logo.png',
      logoProcessedDataUri: null,
      businessSummary: 'Test.', narrativeDistributor: 'D.', narrativeProcurement: 'P.', narrativeSku: 'S.',
      mode: 'full' as const,
    };
    const payload = buildPdfPayload(input);
    expect(payload.logoProcessed).toBe(false);
    // Falls back to original URL
    expect(payload.logoUrl).toBe('https://example.com/logo.png');
  });

  it('logoProcessed = false for conservative mode regardless', async () => {
    const { buildPdfPayload } = await import('../pdf/build-pdf-payload');
    const input = {
      restaurantName: 'Test', fullName: 'Test User', conceptType: 'Casual dining',
      locations: 'Single location', annualSpend: 1_500_000, spendBucket: '$1M–$3M',
      finalPctDisplay: '5%', dollarEstimateDisplay: '$75,000', dollarEstimate: 75000,
      caseStudy: "MaryAnn's Diner",
      year1: 75000, year2: 77925, year3: 80966, year4: 84123, year5: 87404,
      projectionHeights: { year1: 86, year2: 89, year3: 93, year4: 96, year5: 100 },
      logoUrl: 'https://example.com/logo.png',
      logoProcessedDataUri: 'data:image/png;base64,abc123',
      businessSummary: 'Test.', narrativeDistributor: 'D.', narrativeProcurement: 'P.', narrativeSku: 'S.',
      mode: 'conservative' as const,
    };
    const payload = buildPdfPayload(input);
    expect(payload.logoProcessed).toBe(false);
    expect(payload.hasLogo).toBe(false);
    expect(payload.logoUrl).toBe('');
  });
});
