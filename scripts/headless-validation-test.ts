#!/usr/bin/env npx tsx
// Headless browser validation test — runs the validate-website API against 10
// known-failing sites and reports whether headless rendering rescued them.
//
// Usage:
//   BASE_URL=http://localhost:3000 npx tsx scripts/headless-validation-test.ts
//   BASE_URL=https://your-staging.vercel.app npx tsx scripts/headless-validation-test.ts

interface TestSite {
  url: string;
  name: string;
  reason: string; // why this site was chosen
  expectHeadless: boolean; // do we expect headless to fire?
}

const TEST_SITES: TestSite[] = [
  // ── Reachable but score=0 in pre-headless benchmark (JS-rendered / thin HTML)
  {
    url: 'https://www.domainehudson.com',
    name: 'Domaine Hudson',
    reason: 'Reachable, score=0 — likely JS-rendered',
    expectHeadless: true,
  },
  {
    url: 'https://www.thecellarcda.com',
    name: 'The Cellar',
    reason: 'Reachable, score=0 — low name/domain match + thin HTML',
    expectHeadless: true,
  },
  {
    url: 'https://www.themanship.com',
    name: 'The Manship',
    reason: 'Reachable, score=0 — JS-rendered, no static signals',
    expectHeadless: true,
  },
  {
    url: 'https://www.pullmandining.com',
    name: 'Pullman Bar & Diner',
    reason: 'Reachable, score=0 — thin initial HTML',
    expectHeadless: true,
  },
  {
    url: 'https://www.opensourcebrewing.com',
    name: 'Open Range',
    reason: 'Reachable, score=0 — domain mismatch + JS-rendered',
    expectHeadless: true,
  },
  {
    url: 'https://www.elegantelephant.com',
    name: 'Ludivine',
    reason: 'Reachable, score=0 — domain mismatch, JS-rendered',
    expectHeadless: true,
  },
  // ── Inaccessible (network_error / timeout) — headless is the rescue path
  {
    url: 'https://olebaycafe.com',
    name: 'Ole Bay Cafe',
    reason: 'Inaccessible — network_error; headless may reach it',
    expectHeadless: true,
  },
  {
    url: 'https://bottegafrombirmingham.com',
    name: 'Bottega',
    reason: 'Inaccessible — network_error; restaurant domain word in path',
    expectHeadless: true,
  },
  {
    url: 'https://www.marxbroscafe.com',
    name: 'Marx Bros Cafe',
    reason: 'Inaccessible — network_error; "cafe" in domain',
    expectHeadless: true,
  },
  {
    url: 'https://www.orsalaska.com',
    name: 'Orso',
    reason: 'Inaccessible — network_error; domain mismatch',
    expectHeadless: true,
  },
];

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

interface ValidationResult {
  finalDecision: string;
  restaurantSignalScore: number;
  negativeSignalScore: number;
  websiteReachabilityStatus: string;
  internalFlags: string[];
  reasons: string[];
}

interface TestResult {
  site: string;
  name: string;
  passed: boolean;
  decision: string;
  score: number;
  reachability: string;
  hadHeadless: boolean;
  flags: string[];
  error?: string;
}

async function testSite(site: TestSite): Promise<TestResult> {
  try {
    const response = await fetch(`${BASE_URL}/api/validate-website`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website: site.url, restaurantName: site.name }),
    });

    if (!response.ok) {
      return {
        site: site.url, name: site.name, passed: false,
        decision: `http_${response.status}`, score: 0, reachability: 'error',
        hadHeadless: false, flags: [], error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as { result: ValidationResult };
    const result = data.result;

    const hadHeadless = result.internalFlags.includes('headless_attempted');
    const decision = result.finalDecision;
    const score = result.restaurantSignalScore;

    // Pass = not hard-rejected as invalid; headless attempted if expected
    const notRejected = decision !== 'invalid_website' && decision !== 'national_chain';
    const headlessOk = !site.expectHeadless || hadHeadless;
    const passed = notRejected && headlessOk;

    return {
      site: site.url, name: site.name, passed,
      decision, score, reachability: result.websiteReachabilityStatus,
      hadHeadless, flags: result.internalFlags,
    };
  } catch (err) {
    return {
      site: site.url, name: site.name, passed: false,
      decision: 'error', score: 0, reachability: 'error',
      hadHeadless: false, flags: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function run(): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log('HEADLESS BROWSER VALIDATION TEST');
  console.log(`${'='.repeat(60)}`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Sites:  ${TEST_SITES.length}`);
  console.log(`${'='.repeat(60)}\n`);

  // Run sequentially to avoid hammering the local server
  const results: TestResult[] = [];
  for (const site of TEST_SITES) {
    process.stdout.write(`Testing ${site.name.padEnd(25)} ... `);
    const r = await testSite(site);
    results.push(r);
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    const headlessTag = r.hadHeadless ? '[headless]' : '[no headless]';
    console.log(`${status} | ${r.decision.padEnd(22)} | score=${String(r.score).padEnd(3)} | ${headlessTag}`);
    if (r.error) console.log(`           Error: ${r.error}`);
  }

  const passed = results.filter((r) => r.passed).length;
  const headlessCount = results.filter((r) => r.hadHeadless).length;

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Passed:         ${passed}/${results.length}`);
  console.log(`Headless fired: ${headlessCount}/${results.length}`);
  console.log(`Success rate:   ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log();

  const verified = results.filter((r) => r.decision === 'verified_restaurant').length;
  const plausible = results.filter((r) => r.decision === 'plausible_unverified').length;
  const rejected = results.filter((r) => ['invalid_website', 'clear_non_fit', 'national_chain'].includes(r.decision)).length;

  console.log(`verified_restaurant:   ${verified}`);
  console.log(`plausible_unverified:  ${plausible}`);
  console.log(`rejected/error:        ${rejected}`);
  console.log(`${'='.repeat(60)}\n`);

  process.exit(passed === results.length ? 0 : 1);
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
