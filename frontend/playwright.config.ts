import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright is intentionally scoped to ./e2e to avoid discovering Vitest unit tests
 * (for example: src/lib/foo.test.ts) which import from "vitest" and must only run under Vitest.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.{spec,test}.{js,ts,jsx,tsx}'],
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['html'], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8081',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? 'npm run dev -- --port 8081',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

