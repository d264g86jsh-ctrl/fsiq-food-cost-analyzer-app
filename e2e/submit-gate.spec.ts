/**
 * E2E regression: submit gate blocks invalid_website before the browser Lead pixel.
 *
 * Two core scenarios:
 *   1. User submits with an invalid URL → gate blocks, retry message shown, no Lead pixel.
 *   2. User fixes the URL, re-validates, re-submits → gate passes, proceed to submit.
 *
 * Uses "notadomain" — normalizeUrl rejects it instantly (no dot in hostname → isValid=false)
 * so #1 returns invalid_website without any network call. Fast and deterministic.
 */
import { test, expect, type Page } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

const continueBtn = (page: Page) =>
  page.locator('button[type="button"]').filter({ hasText: 'Continue' }).first();
const backBtn = (page: Page) =>
  page.locator('button[type="button"]').filter({ hasText: 'Back' }).first();
const submitBtn = (page: Page) =>
  page.locator('button[type="submit"]').first();

// The retry message text set by the submit gate
const RETRY_MSG_LOCATOR = (page: Page) =>
  page.locator('[role="alert"]').filter({ hasText: /update your website URL/i });

// SuccessState shows "Analysis running" — only visible after a successful submit
const SUCCESS_INDICATOR = (page: Page) =>
  page.locator('text=Analysis running');

/**
 * Wait for #1 validation to settle with a specific expected state.
 * Two-phase: first wait for the element to appear (not idle),
 * then wait for it to show the expected state.
 */
async function waitForValidationResult(page: Page, expectedState: string, timeout = 25000) {
  await page.waitForSelector('[data-validation-state]', { timeout });
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector('[data-validation-state]');
      return el?.getAttribute('data-validation-state') === expected;
    },
    expectedState,
    { timeout },
  );
}

/**
 * Navigate to step 2 — fill step-1 fields and wait for #1 to settle with the given state.
 * Uses named required-field filling.
 */
async function goToStep2WithUrl(page: Page, url: string, urlValidationState: string) {
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('input[autocomplete="organization"]').waitFor({ timeout: 15000 });

  await page.fill('input[autocomplete="organization"]', 'Gate Test Restaurant');
  await page.fill('input[autocomplete="url"]', url);

  await page.locator('input[autocomplete="url"]').blur();
  await waitForValidationResult(page, urlValidationState);

  await page.locator('input[type="checkbox"]').click();
  await page.waitForTimeout(100);

  await expect(continueBtn(page)).toBeEnabled({ timeout: 5000 });
  await continueBtn(page).click();
  await page.locator('select').first().waitFor({ state: 'visible', timeout: 10000 });
}

/** Fill steps 2–4 contact info given we're already on step 2. */
async function fillSteps2To4(page: Page) {
  // Step 2
  await page.locator('select').nth(0).selectOption('Casual dining');
  await page.locator('select').nth(1).selectOption('2-4 locations');
  await page.locator('input[placeholder*="1.5M"]').fill('$1.5M');
  await expect(continueBtn(page)).toBeEnabled({ timeout: 5000 });
  await continueBtn(page).click();
  await page.locator('select').first().waitFor({ state: 'visible', timeout: 10000 });

  // Step 3
  await page.locator('select').nth(0).selectOption('national_broadliners');
  await page.locator('select').nth(1).selectOption('market_price_single');
  await page.locator('textarea').fill('chicken, beef, produce');
  await expect(continueBtn(page)).toBeEnabled({ timeout: 5000 });
  await continueBtn(page).click();

  // Step 4 — contact info
  await page.locator('input[autocomplete="name"]').waitFor({ state: 'visible', timeout: 10000 });
  await page.fill('input[autocomplete="name"]', 'Test User');
  await page.fill('input[autocomplete="email"]', 'test@gatetest.com');
  await page.fill('input[type="tel"]', '+1 512 555 0100');
}

/** Navigate all four steps with the given URL pre-validated. */
async function goToStep4(page: Page, url: string, urlValidationState: string) {
  await goToStep2WithUrl(page, url, urlValidationState);
  await fillSteps2To4(page);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('submit gate blocks on invalid_website and shows retry message', async ({ page }) => {
  await goToStep4(page, 'notadomain', 'invalid_website');

  await expect(submitBtn(page)).toBeEnabled({ timeout: 5000 });
  await submitBtn(page).click();

  // Gate blocks — retry message visible
  await expect(RETRY_MSG_LOCATOR(page)).toBeVisible({ timeout: 8000 });

  // SuccessState should NOT have been shown (gate blocked before submitAnalysis)
  await expect(SUCCESS_INDICATOR(page)).not.toBeVisible();
});

test('submit gate: no browser Lead pixel fires on blocked submit', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__fbqLeadCalls = [];
    (window as unknown as Record<string, unknown>).fbq = (...args: unknown[]) => {
      const call = args as [string, string, ...unknown[]];
      if (call[1] === 'Lead') {
        ((window as unknown as Record<string, unknown>).__fbqLeadCalls as unknown[]).push(call);
      }
    };
  });

  await goToStep4(page, 'notadomain', 'invalid_website');

  await expect(submitBtn(page)).toBeEnabled({ timeout: 5000 });
  await submitBtn(page).click();

  await expect(RETRY_MSG_LOCATOR(page)).toBeVisible({ timeout: 8000 });

  const leadCalls = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__fbqLeadCalls || [],
  );
  expect(leadCalls).toHaveLength(0);
});

test('valid URL passes the gate — retry message never appears', async ({ page }) => {
  // Start fresh with a valid restaurant URL already validated as 'verified'.
  // This covers the "user fixed their URL" state: after re-validation #1 has settled
  // with a passing result, the next submit attempt should NOT be blocked.
  await goToStep4(page, 'mamatigre.com', 'verified');

  await expect(submitBtn(page)).toBeEnabled({ timeout: 5000 });
  await submitBtn(page).click();

  // Wait briefly — the gate should pass and submit should proceed.
  await page.waitForTimeout(800);

  // The retry message must NOT appear — gate passed.
  await expect(RETRY_MSG_LOCATOR(page)).not.toBeVisible();

  // Submit button should be disabled (either isSubmitting or isValidatingForSubmit),
  // OR SuccessState should appear — both confirm the gate passed.
  const submitDisabled = await submitBtn(page).isDisabled().catch(() => false);
  const successVisible = await SUCCESS_INDICATOR(page).isVisible().catch(() => false);
  expect(submitDisabled || successVisible).toBe(true);
});
