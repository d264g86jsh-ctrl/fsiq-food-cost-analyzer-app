// Server-only Anthropic SDK wrapper.
// ANTHROPIC_API_KEY is accessed only here — never passed to client components.
// Phase 8 calls ai-researcher.ts and ai-narrative.ts; this module is not imported by UI code.

import Anthropic from '@anthropic-ai/sdk';

export const AI_MODEL = 'claude-sonnet-4-6';
export const AI_MAX_TOKENS = 1000;

// Module-level singleton — avoids re-instantiating on every call within a request.
let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function isAiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Only used in tests to reset the singleton between test runs.
export function _resetClientForTesting(): void {
  _client = null;
}
