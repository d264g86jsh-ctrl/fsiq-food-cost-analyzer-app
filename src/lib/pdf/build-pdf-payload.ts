// Phase 6 — Assemble the 27-variable PDFMonkey payload.
// 26 variables from SOP §19 + approved reportDate (self-dates the report).
// Source of truth: docs/FSIQ_SOP_v3.3.md §19, docs/build-phases.md §Phase 6.
//
// conceptBenchmark en-dashes are intentional for PDF display.
// The no-em/en-dash rule applies to AI narrative copy, not these fixed benchmark strings.

import type { PdfPayload, GeneratePdfInput } from './pdf-types';

// ── Concept benchmark lookup (SOP §18 benchmarks table) ──────────────────────
// Default to "28%–32%" for unknown/unlisted concept types.

const CONCEPT_BENCHMARKS: Record<string, string> = {
  'Quick service':            '20%–25%',
  'Fast casual':              '25%–30%',
  'Casual dining':            '28%–32%',
  'Family dining':            '28%–32%',
  'Full-service independent': '28%–35%',
  'Fine dining':              '30%–35%',
};

const DEFAULT_BENCHMARK = '28%–32%';

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDollars(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function titleCase(str: string): string {
  return str
    .trim()
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildPdfPayload(input: GeneratePdfInput): PdfPayload {
  const isConservative = input.mode === 'conservative';

  // Conservative PDF clears all website-specific claims.
  const logoUrl       = isConservative ? '' : (input.logoUrl ?? '');
  const hasLogo       = !isConservative && logoUrl !== '';
  const businessSummary = isConservative ? '' : input.businessSummary;

  // Projection display strings (year1–year5 are always populated for qualified leads)
  const y1 = input.year1 ?? 0;
  const y2 = input.year2 ?? 0;
  const y3 = input.year3 ?? 0;
  const y4 = input.year4 ?? 0;
  const y5 = input.year5 ?? 0;

  const heights = input.projectionHeights ?? { year1: 0, year2: 0, year3: 0, year4: 0, year5: 100 };

  return {
    // Contact / identity
    restaurantName: titleCase(input.restaurantName),
    fullName:       titleCase(input.fullName),

    // Restaurant profile (raw form values — template renders them directly)
    conceptTypeRaw: input.conceptType,
    locationsRaw:   input.locations,

    // Savings summary
    spendBucket:          input.spendBucket ?? '',
    annualSpendDisplay:   formatDollars(input.annualSpend),
    finalPctDisplay:      input.finalPctDisplay ?? '',
    dollarEstimateDisplay: input.dollarEstimateDisplay ?? '',
    conceptBenchmark:     CONCEPT_BENCHMARKS[input.conceptType] ?? DEFAULT_BENCHMARK,

    // Case study
    caseStudy: input.caseStudy ?? '',

    // 5-year projection display strings
    year1Display: formatDollars(y1),
    year2Display: formatDollars(y2),
    year3Display: formatDollars(y3),
    year4Display: formatDollars(y4),
    year5Display: formatDollars(y5),

    // Bar heights (integer percentages; year5 = 100 by formula)
    year1HeightPct: heights.year1,
    year2HeightPct: heights.year2,
    year3HeightPct: heights.year3,
    year4HeightPct: heights.year4,
    year5HeightPct: heights.year5,

    // AI research (conservative clears website-specific fields)
    logoUrl,
    hasLogo,
    businessSummary,

    // AI narrative
    narrativeDistributor: input.narrativeDistributor,
    narrativeProcurement: input.narrativeProcurement,
    narrativeSku:         input.narrativeSku,

    // Presentation metadata (approved 27th variable)
    reportDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}
