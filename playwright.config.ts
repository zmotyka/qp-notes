import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 120000,
  expect: { timeout: 10000 },
  reporter: [['html', { outputFolder: 'tests/results/html-report' }], ['json', { outputFile: 'tests/results/report.json' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    port: 5173,
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    {
      name: 'laptop',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['iPad (gen 7)'],
        browserName: 'chromium',
      },
    },
    {
      name: 'iphone',
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium',
      },
    },
  ],
});
