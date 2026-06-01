import { defineConfig, devices } from '@playwright/test';

const all = ['chromium', 'firefox', 'webkit'] as const;
type BrowserName = (typeof all)[number];

const requested = (process.env.PLAYWRIGHT_BROWSERS ?? 'chromium')
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is BrowserName => (all as readonly string[]).includes(s));

const deviceFor: Record<BrowserName, keyof typeof devices> = {
  chromium: 'Desktop Chrome',
  firefox: 'Desktop Firefox',
  webkit: 'Desktop Safari',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: requested.map((name) => ({
    name,
    use: { ...devices[deviceFor[name]] },
  })),
});
