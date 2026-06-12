import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1, // single worker — tests share a single server and run sequentially

  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:3000',
    ...devices['Desktop Chrome'],
    headless: true,
  },

  webServer: {
    command: 'pnpm dev --port 3000',
    url: 'http://127.0.0.1:3000',
    // In CI always start fresh; locally reuse an already-running server to save time
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
