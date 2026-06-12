/**
 * Regression test: select-field persistence.
 *
 * History: commit ea2f450 (2026-05-18) changed distributor_type and
 * procurement_strategy to RadioCardGroup; 80dfc42 reverted them 10 minutes
 * later after intermittent deselect was observed on desktop. This spec locks
 * the current <select> behaviour so any future reintroduction of a
 * deselect-prone pattern is caught immediately.
 *
 * Covers all four required <select> fields across steps 2 and 3, plus
 * the Back/Next step-unmount/remount cycle that exercises formData
 * persistence across React's conditional render.
 */
import { test, expect, type Page } from '@playwright/test';

const ITERS = 50;

const CONCEPT_OPTIONS = [
  'Quick service', 'Fast casual', 'Casual dining', 'Family dining', 'Fine dining',
];
const LOCATION_OPTIONS = ['2-4 locations', '5-10 locations', '10+ locations'];
const DISTRIBUTOR_OPTIONS = [
  'national_broadliners', 'combination', 'regional', 'local_specialty',
];
const PROCUREMENT_OPTIONS = [
  'market_price_single', 'market_price_multiple', 'negotiated_cost_plus',
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

const continueBtn = (page: Page) =>
  page.locator('button[type="button"]').filter({ hasText: 'Continue' }).first();
const backBtn = (page: Page) =>
  page.locator('button[type="button"]').filter({ hasText: 'Back' }).first();

/** Navigate to Step 2 (concept + locations + spend selects). */
async function goToStep2(page: Page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('input[autocomplete="organization"]').waitFor({ timeout: 15000 });

  await page.fill('input[autocomplete="organization"]', 'Test Bistro');
  await page.fill('input[autocomplete="url"]', 'tacobell.com');

  // Blur URL to trigger website validation, then wait for it to settle.
  await page.locator('input[autocomplete="url"]').blur();
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-validation-state]');
      return !el || el.getAttribute('data-validation-state') !== 'checking';
    },
    { timeout: 20000 },
  );

  // React-controlled checkbox: click triggers onChange.
  await page.locator('input[type="checkbox"]').click();
  await page.waitForTimeout(100);

  await expect(continueBtn(page)).toBeEnabled({ timeout: 5000 });
  await continueBtn(page).click();
  await page.locator('select').first().waitFor({ state: 'visible', timeout: 10000 });
}

/** Navigate to Step 3 (distributor + procurement selects). */
async function goToStep3(page: Page) {
  await goToStep2(page);
  await page.locator('select').nth(0).selectOption('Casual dining');
  await page.locator('select').nth(1).selectOption('2-4 locations');
  await page.locator('input[placeholder*="1.5M"]').fill('$1.5M');
  await expect(continueBtn(page)).toBeEnabled({ timeout: 8000 });
  await continueBtn(page).click();
  await page.locator('select').first().waitFor({ state: 'visible', timeout: 10000 });
}

// ── Persistence tests: 50 select→wait→assert cycles per field ─────────────

test('concept_type: 50 selections all persist', async ({ page }) => {
  await goToStep2(page);
  const sel = page.locator('select').nth(0);
  const failures: string[] = [];

  for (let i = 0; i < ITERS; i++) {
    const val = pick(CONCEPT_OPTIONS, i);
    await sel.selectOption(val);
    await page.waitForTimeout(300);
    const got = await sel.inputValue();
    if (got !== val) failures.push(`i=${i}: want="${val}" got="${got}"`);
  }

  expect(failures, failures.join(', ')).toEqual([]);
});

test('locations: 50 selections all persist', async ({ page }) => {
  await goToStep2(page);
  const sel = page.locator('select').nth(1);
  const failures: string[] = [];

  for (let i = 0; i < ITERS; i++) {
    const val = pick(LOCATION_OPTIONS, i);
    await sel.selectOption(val);
    await page.waitForTimeout(300);
    const got = await sel.inputValue();
    if (got !== val) failures.push(`i=${i}: want="${val}" got="${got}"`);
  }

  expect(failures, failures.join(', ')).toEqual([]);
});

test('distributor_type: 50 selections all persist', async ({ page }) => {
  await goToStep3(page);
  const sel = page.locator('select').nth(0);
  const failures: string[] = [];

  for (let i = 0; i < ITERS; i++) {
    const val = pick(DISTRIBUTOR_OPTIONS, i);
    await sel.selectOption(val);
    await page.waitForTimeout(300);
    const got = await sel.inputValue();
    if (got !== val) failures.push(`i=${i}: want="${val}" got="${got}"`);
  }

  expect(failures, failures.join(', ')).toEqual([]);
});

test('procurement_strategy: 50 selections all persist', async ({ page }) => {
  await goToStep3(page);
  const sel = page.locator('select').nth(1);
  const failures: string[] = [];

  for (let i = 0; i < ITERS; i++) {
    const val = pick(PROCUREMENT_OPTIONS, i);
    await sel.selectOption(val);
    await page.waitForTimeout(300);
    const got = await sel.inputValue();
    if (got !== val) failures.push(`i=${i}: want="${val}" got="${got}"`);
  }

  expect(failures, failures.join(', ')).toEqual([]);
});

// ── Remount regression: formData survives step-3 div unmount/remount ────────

test('Back/Next: step-3 values survive 20 unmount/remount cycles', async ({ page }) => {
  await goToStep3(page);

  const distSel = page.locator('select').nth(0);
  const procSel = page.locator('select').nth(1);
  const failures: string[] = [];

  for (let i = 0; i < 20; i++) {
    const distVal = pick(DISTRIBUTOR_OPTIONS, i);
    const procVal = pick(PROCUREMENT_OPTIONS, i);

    await distSel.selectOption(distVal);
    await procSel.selectOption(procVal);

    // Back → step-2 div mounts, step-3 div unmounts
    await backBtn(page).click();
    await page.locator('select').first().waitFor({ state: 'visible' });

    // Continue → step-3 div remounts; formData lives in parent AnalyzerForm
    await expect(continueBtn(page)).toBeEnabled({ timeout: 5000 });
    await continueBtn(page).click();
    await distSel.waitFor({ state: 'visible' });

    const distGot = await distSel.inputValue();
    const procGot = await procSel.inputValue();

    if (distGot !== distVal)
      failures.push(`dist i=${i}: want="${distVal}" got="${distGot}"`);
    if (procGot !== procVal)
      failures.push(`proc i=${i}: want="${procVal}" got="${procGot}"`);
  }

  expect(failures, failures.join(', ')).toEqual([]);
});
