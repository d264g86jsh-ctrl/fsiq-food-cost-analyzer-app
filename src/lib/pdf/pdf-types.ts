// Phase 6 — PDF generation types.
// Source of truth: docs/build-phases.md §Phase 6, docs/FSIQ_SOP_v3.3.md §19.
//
// The 26 SOP variables plus three approved presentation/app-control variables (29 total):
//   reportDate     — self-dates the report
//   calendlyUrl    — Calendly booking link, app-controlled with UTM params
//   fsiqIqLogoUrl  — FSIQ IQ chip mark fallback logo, app-controlled
// See docs/architecture.md §PDF for routing rules.

// ── Mode decision ─────────────────────────────────────────────────────────────

export type PdfMode = 'full' | 'conservative' | 'skip';

export interface PdfModeDecision {
  mode: PdfMode;
  reason: string;
}

// ── Payload ───────────────────────────────────────────────────────────────────

// 29 variables sent to PDFMonkey (26 from SOP §19 + reportDate + calendlyUrl + fsiqIqLogoUrl).
export interface PdfPayload {
  // Contact / identity
  restaurantName: string;
  fullName: string;

  // Restaurant profile (raw form values)
  conceptTypeRaw: string;
  locationsRaw: string;

  // Savings summary
  spendBucket: string;
  annualSpendDisplay: string;
  finalPctDisplay: string;
  dollarEstimateDisplay: string;
  conceptBenchmark: string; // e.g. "28%–32%" — en-dashes intentional for PDF display

  // Case study
  caseStudy: string;

  // 5-year projections — display strings
  year1Display: string;
  year2Display: string;
  year3Display: string;
  year4Display: string;
  year5Display: string;

  // 5-year projections — bar heights (0–100, year5 always 100)
  year1HeightPct: number;
  year2HeightPct: number;
  year3HeightPct: number;
  year4HeightPct: number;
  year5HeightPct: number;

  // AI research outputs (conservative mode sets logoUrl="" and hasLogo=false)
  logoUrl: string;
  hasLogo: boolean;
  businessSummary: string;

  // AI narrative outputs
  narrativeDistributor: string;
  narrativeProcurement: string;
  narrativeSku: string;

  // Presentation metadata (approved 27th variable — self-dates the report)
  reportDate: string; // e.g. "May 2026"

  // App-controlled CTA and branding (28th and 29th variables)
  calendlyUrl: string;    // Calendly booking link for CTAs — app-controlled, not template variable
  fsiqIqLogoUrl: string;  // FSIQ IQ chip mark fallback logo — app-controlled
}

// ── Input ─────────────────────────────────────────────────────────────────────

export interface GeneratePdfInput {
  // Form fields
  restaurantName: string;
  fullName: string;
  conceptType: string;
  locations: string;

  // Qualification outputs (all null when not qualified)
  annualSpend: number;
  spendBucket: string | null;
  finalPctDisplay: string | null;
  dollarEstimateDisplay: string | null;
  dollarEstimate: number | null;
  caseStudy: string | null;
  year1: number | null;
  year2: number | null;
  year3: number | null;
  year4: number | null;
  year5: number | null;
  projectionHeights: Record<'year1' | 'year2' | 'year3' | 'year4' | 'year5', number> | null;

  // AI research outputs
  logoUrl: string | null;
  businessSummary: string;
  narrativeDistributor: string;
  narrativeProcurement: string;
  narrativeSku: string;

  // PDF mode (determined before calling generatePdf)
  mode: 'full' | 'conservative';
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface GeneratePdfResult {
  pdfStatus: 'complete' | 'error' | 'skipped';
  pdfMode: 'full' | 'conservative' | null;
  pdfMonkeyDocumentId: string | null;
  pdfDownloadUrl: string | null;
  pdfError: string | null;
  pdfRetryCount: number;
  pdfUrlType: 'viewer' | 'download' | null; // 'viewer' = preview_url; 'download' = S3 fallback; null = no URL
}
