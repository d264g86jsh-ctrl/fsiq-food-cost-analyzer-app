// Tests for runAiResearch.
// All external AI calls are mocked — no real network requests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiResearchInput } from '../ai/ai-types';

// Mock ai-client before importing the function under test
vi.mock('../ai/ai-client', () => ({
  getAnthropicClient: vi.fn(),
  AI_MODEL: 'claude-sonnet-4-6',
  AI_MAX_TOKENS: 1000,
  isAiAvailable: vi.fn(),
}));

import { runAiResearch } from '../ai/ai-researcher';
import { getAnthropicClient } from '../ai/ai-client';

const mockGetClient = vi.mocked(getAnthropicClient);

// ── Fixture ───────────────────────────────────────────────────────────────────

const baseInput: AiResearchInput = {
  restaurantName: 'Casa Roberto',
  website: 'https://casaroberto.com',
  state: 'TX',
  conceptType: 'Casual dining',
  locations: '2 – 4 locations',
  annualFoodSpend: '$1M–$3M',
  distributorType: 'National broadliners (Sysco, US Foods)',
  procurementStrategy: 'Market price, single distributor',
  topSkus: 'beef, chicken, tortillas',
  normalizedUrl: 'https://casaroberto.com',
  finalUrl: 'https://casaroberto.com/',
  finalDecision: 'verified_restaurant',
  countryEligibility: 'us_verified',
  websiteReachabilityStatus: 'reachable',
  restaurantSignalScore: 72,
  websiteLogoHints: ['https://casaroberto.com/logo.png'],
  scrapeStatus: 'phase2_signals',
  qualified: true,
  spendBucket: '$1M–$3M',
  dollarEstimate: 147_000,
  finalPct: 7.35,
  year1: 147_000,
  year5: 795_056,
  caseStudy: "MaryAnn's Diner",
};

function makeMockClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
      }),
    },
  };
}

const validResearchResponse = JSON.stringify({
  logoUrl: 'https://casaroberto.com/logo.png',
  businessSummary: 'Casa Roberto is a casual dining restaurant with multiple locations in Texas.',
  conceptSignals: ['casual dining', 'multi-location', 'mexican cuisine'],
});

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetClient.mockReset();
});

describe('runAiResearch — fallback: no API key', () => {
  it('returns fallback when ANTHROPIC_API_KEY is missing', async () => {
    mockGetClient.mockReturnValue(null);
    const r = await runAiResearch(baseInput);
    expect(r.aiUsed).toBe(false);
    expect(r.aiFallbackUsed).toBe(true);
    expect(r.aiModel).toBeNull();
    expect(r.aiError).toMatch(/not configured/i);
  });

  it('fallback businessSummary contains restaurant name', async () => {
    mockGetClient.mockReturnValue(null);
    const r = await runAiResearch(baseInput);
    expect(r.businessSummary).toContain('Casa Roberto');
  });

  it('fallback logoUrl is null when no key', async () => {
    mockGetClient.mockReturnValue(null);
    const r = await runAiResearch(baseInput);
    expect(r.logoUrl).toBeNull();
  });
});

describe('runAiResearch — successful AI call', () => {
  it('returns aiUsed=true on success', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validResearchResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.aiUsed).toBe(true);
    expect(r.aiFallbackUsed).toBe(false);
    expect(r.aiError).toBeNull();
  });

  it('returns aiModel as claude-sonnet-4-6 on success', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validResearchResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.aiModel).toBe('claude-sonnet-4-6');
  });

  it('accepts logoUrl that is in websiteLogoHints', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validResearchResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.logoUrl).toBe('https://casaroberto.com/logo.png');
  });

  it('returns businessSummary from AI response', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validResearchResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.businessSummary).toContain('Casa Roberto');
  });

  it('returns conceptSignals from AI response', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validResearchResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.conceptSignals).toContain('casual dining');
  });

  it('generatedAt is a valid ISO timestamp', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validResearchResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(() => new Date(r.generatedAt).toISOString()).not.toThrow();
  });
});

describe('runAiResearch — logo URL guard', () => {
  it('rejects logoUrl that is NOT in websiteLogoHints', async () => {
    const fabricated = JSON.stringify({
      logoUrl: 'https://invented.com/fabricated-logo.png',
      businessSummary: 'A restaurant.',
      conceptSignals: ['casual dining'],
    });
    mockGetClient.mockReturnValue(makeMockClient(fabricated) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.logoUrl).toBeNull();
    expect(r.aiUsed).toBe(true);
  });

  it('accepts null logoUrl from AI', async () => {
    const noLogo = JSON.stringify({ logoUrl: null, businessSummary: 'A restaurant.', conceptSignals: [] });
    mockGetClient.mockReturnValue(makeMockClient(noLogo) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.logoUrl).toBeNull();
    expect(r.aiFallbackUsed).toBe(false);
  });
});

describe('runAiResearch — response validation', () => {
  it('falls back on invalid JSON', async () => {
    mockGetClient.mockReturnValue(makeMockClient('not valid json at all') as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.aiFallbackUsed).toBe(true);
    expect(r.aiUsed).toBe(true);
    expect(r.aiError).toMatch(/invalid/i);
  });

  it('falls back when businessSummary is missing', async () => {
    const bad = JSON.stringify({ logoUrl: null, conceptSignals: [] });
    mockGetClient.mockReturnValue(makeMockClient(bad) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.aiFallbackUsed).toBe(true);
  });

  it('strips markdown code fences from response', async () => {
    const fenced = '```json\n' + validResearchResponse + '\n```';
    mockGetClient.mockReturnValue(makeMockClient(fenced) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.aiFallbackUsed).toBe(false);
    expect(r.businessSummary).toBeTruthy();
  });

  it('truncates businessSummary at 500 chars', async () => {
    const longSummary = JSON.stringify({
      logoUrl: null,
      businessSummary: 'A'.repeat(600),
      conceptSignals: [],
    });
    mockGetClient.mockReturnValue(makeMockClient(longSummary) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.businessSummary.length).toBeLessThanOrEqual(500);
  });

  it('limits conceptSignals to 10 items', async () => {
    const manySignals = JSON.stringify({
      logoUrl: null,
      businessSummary: 'A restaurant.',
      conceptSignals: Array.from({ length: 15 }, (_, i) => `tag${i}`),
    });
    mockGetClient.mockReturnValue(makeMockClient(manySignals) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.conceptSignals.length).toBeLessThanOrEqual(10);
  });

  it('filters non-string items from conceptSignals', async () => {
    const mixedSignals = JSON.stringify({
      logoUrl: null,
      businessSummary: 'A restaurant.',
      conceptSignals: ['valid', 42, null, 'also-valid'],
    });
    mockGetClient.mockReturnValue(makeMockClient(mixedSignals) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.conceptSignals).toEqual(['valid', 'also-valid']);
  });
});

describe('runAiResearch — AI error/timeout', () => {
  it('returns fallback on AI throw', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('AbortError: Request timed out'));
    mockGetClient.mockReturnValue({ messages: { create: mockCreate } } as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r.aiUsed).toBe(false);
    expect(r.aiFallbackUsed).toBe(true);
    expect(r.aiError).toContain('AbortError');
  });
});

describe('runAiResearch — output shape guardrail', () => {
  it('result does NOT contain finalPct, dollarEstimate, spendBucket, or dqReason', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validResearchResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await runAiResearch(baseInput);
    expect(r).not.toHaveProperty('finalPct');
    expect(r).not.toHaveProperty('dollarEstimate');
    expect(r).not.toHaveProperty('spendBucket');
    expect(r).not.toHaveProperty('dqReason');
  });
});
