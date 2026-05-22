// Tests for generateAiNarrative.
// All external AI calls are mocked — no real network requests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiResearchInput } from '../ai/ai-types';

vi.mock('../ai/ai-client', () => ({
  getAnthropicClient: vi.fn(),
  AI_MODEL: 'claude-sonnet-4-6',
  AI_MAX_TOKENS: 1000,
  isAiAvailable: vi.fn(),
}));

import { generateAiNarrative } from '../ai/ai-narrative';
import { getAnthropicClient } from '../ai/ai-client';
import { buildNarrativeUserPrompt } from '../ai/prompts';

const mockGetClient = vi.mocked(getAnthropicClient);

// ── Fixture ───────────────────────────────────────────────────────────────────

const baseInput: AiResearchInput = {
  restaurantName: 'Casa Roberto',
  website: 'https://casaroberto.com',
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
  websiteLogoHints: [],
  logoUrl: null,
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

const validNarrativeResponse = JSON.stringify({
  narrativeDistributor:
    'Casa Roberto currently sources through national broadliners, which typically means competitive pricing on high-volume items but limited flexibility on specialty ingredients. Reviewing freight terms and delivery minimums could yield meaningful reductions based on your purchase volume.',
  narrativeProcurement:
    'Purchasing at market price through a single distributor gives Casa Roberto a clear baseline for benchmarking, but also means pricing may drift above contract alternatives. A systematic review of your current rates against market comparables is a practical first step.',
  narrativeSku:
    'Beef, chicken, and tortillas represent significant weekly spend for a casual dining concept at this volume. Commodity price cycles on these categories create regular opportunities to lock in favorable rates or negotiate pricing tiers, estimated to reduce costs based on your profile.',
});

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetClient.mockReset();
});

describe('generateAiNarrative — fallback: no API key', () => {
  it('returns fallback when ANTHROPIC_API_KEY is missing', async () => {
    mockGetClient.mockReturnValue(null);
    const r = await generateAiNarrative(baseInput);
    expect(r.aiUsed).toBe(false);
    expect(r.aiFallbackUsed).toBe(true);
    expect(r.aiModel).toBeNull();
    expect(r.aiError).toMatch(/not configured/i);
  });

  it('fallback narrativeDistributor references distributorType', async () => {
    mockGetClient.mockReturnValue(null);
    const r = await generateAiNarrative(baseInput);
    expect(r.narrativeDistributor.toLowerCase()).toContain('national broadliners');
  });

  it('fallback narrativeProcurement references procurementStrategy', async () => {
    mockGetClient.mockReturnValue(null);
    const r = await generateAiNarrative(baseInput);
    expect(r.narrativeProcurement.toLowerCase()).toContain('market price');
  });

  it('fallback narrativeSku references topSkus when provided', async () => {
    mockGetClient.mockReturnValue(null);
    const r = await generateAiNarrative(baseInput);
    expect(r.narrativeSku).toContain('beef, chicken, tortillas');
  });

  it('fallback narrativeSku is generic when topSkus is empty', async () => {
    mockGetClient.mockReturnValue(null);
    const emptySkus = { ...baseInput, topSkus: '' };
    const r = await generateAiNarrative(emptySkus);
    expect(r.narrativeSku).not.toContain('beef');
    expect(r.narrativeSku.length).toBeGreaterThan(10);
  });
});

describe('generateAiNarrative — successful AI call', () => {
  it('returns aiUsed=true on success', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validNarrativeResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.aiUsed).toBe(true);
    expect(r.aiFallbackUsed).toBe(false);
    expect(r.aiError).toBeNull();
  });

  it('returns aiModel as claude-sonnet-4-6 on success', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validNarrativeResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.aiModel).toBe('claude-sonnet-4-6');
  });

  it('returns all three narrative sections', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validNarrativeResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.narrativeDistributor.length).toBeGreaterThan(10);
    expect(r.narrativeProcurement.length).toBeGreaterThan(10);
    expect(r.narrativeSku.length).toBeGreaterThan(10);
  });

  it('generatedAt is a valid ISO timestamp', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validNarrativeResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(() => new Date(r.generatedAt).toISOString()).not.toThrow();
  });
});

describe('generateAiNarrative — em/en-dash stripping', () => {
  it('strips em-dashes from AI response', async () => {
    const withDash = JSON.stringify({
      narrativeDistributor: 'Good value — but could be better with benchmarking.',
      narrativeProcurement: 'Market price approach — solid baseline.',
      narrativeSku: 'Beef and chicken — high-volume categories.',
    });
    mockGetClient.mockReturnValue(makeMockClient(withDash) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.narrativeDistributor).not.toContain('—');
    expect(r.narrativeProcurement).not.toContain('—');
    expect(r.narrativeSku).not.toContain('—');
  });

  it('strips en-dashes from AI response', async () => {
    const withEnDash = JSON.stringify({
      narrativeDistributor: 'Good value – but could be better.',
      narrativeProcurement: 'Market price – solid baseline.',
      narrativeSku: 'Beef – high volume.',
    });
    mockGetClient.mockReturnValue(makeMockClient(withEnDash) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.narrativeDistributor).not.toContain('–');
    expect(r.narrativeProcurement).not.toContain('–');
    expect(r.narrativeSku).not.toContain('–');
  });
});

describe('generateAiNarrative — response validation', () => {
  it('falls back on invalid JSON', async () => {
    mockGetClient.mockReturnValue(makeMockClient('not json') as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.aiFallbackUsed).toBe(true);
    expect(r.aiUsed).toBe(true);
    expect(r.aiError).toMatch(/invalid/i);
  });

  it('falls back when a narrative section is missing', async () => {
    const partial = JSON.stringify({
      narrativeDistributor: 'Full distributor section.',
      narrativeProcurement: 'Full procurement section.',
      // narrativeSku is missing
    });
    mockGetClient.mockReturnValue(makeMockClient(partial) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.aiFallbackUsed).toBe(true);
  });

  it('truncates each narrative to 600 chars', async () => {
    const long = JSON.stringify({
      narrativeDistributor: 'A'.repeat(700),
      narrativeProcurement: 'B'.repeat(700),
      narrativeSku: 'C'.repeat(700),
    });
    mockGetClient.mockReturnValue(makeMockClient(long) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.narrativeDistributor.length).toBeLessThanOrEqual(600);
    expect(r.narrativeProcurement.length).toBeLessThanOrEqual(600);
    expect(r.narrativeSku.length).toBeLessThanOrEqual(600);
  });

  it('strips markdown code fences from response', async () => {
    const fenced = '```json\n' + validNarrativeResponse + '\n```';
    mockGetClient.mockReturnValue(makeMockClient(fenced) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.aiFallbackUsed).toBe(false);
    expect(r.narrativeDistributor.length).toBeGreaterThan(10);
  });
});

describe('generateAiNarrative — AI error/timeout', () => {
  it('returns fallback on AI throw', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('Request timed out'));
    mockGetClient.mockReturnValue({ messages: { create: mockCreate } } as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r.aiUsed).toBe(false);
    expect(r.aiFallbackUsed).toBe(true);
    expect(r.aiError).toContain('timed out');
  });
});

describe('generateAiNarrative — output shape guardrail', () => {
  it('result does NOT contain finalPct, dollarEstimate, spendBucket, or dqReason', async () => {
    mockGetClient.mockReturnValue(makeMockClient(validNarrativeResponse) as unknown as ReturnType<typeof getAnthropicClient>);
    const r = await generateAiNarrative(baseInput);
    expect(r).not.toHaveProperty('finalPct');
    expect(r).not.toHaveProperty('dollarEstimate');
    expect(r).not.toHaveProperty('spendBucket');
    expect(r).not.toHaveProperty('dqReason');
  });
});

describe('generateAiNarrative — prompt includes savings context', () => {
  it('narrative prompt includes dollarEstimate when qualified', () => {
    const prompt = buildNarrativeUserPrompt(baseInput);
    expect(prompt).toContain('147,000');
    expect(prompt).toContain('7.35%');
    expect(prompt.toLowerCase()).toContain('read-only');
  });

  it('narrative prompt omits savings when not qualified', () => {
    const dqInput = { ...baseInput, qualified: false, dollarEstimate: null, finalPct: null };
    const prompt = buildNarrativeUserPrompt(dqInput);
    expect(prompt).toContain('No savings estimate');
    expect(prompt).not.toContain('147,000');
  });

  it('narrative prompt includes topSkus when provided', () => {
    const prompt = buildNarrativeUserPrompt(baseInput);
    expect(prompt).toContain('beef, chicken, tortillas');
  });

  it('narrative prompt uses generic SKU message when topSkus is empty', () => {
    const prompt = buildNarrativeUserPrompt({ ...baseInput, topSkus: '' });
    expect(prompt).toContain('did not specify');
  });
});
