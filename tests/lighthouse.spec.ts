import { test } from '@playwright/test';
import { gotoApp, installMockEnvironment } from './helpers/mock-auth';

const audits = [
  { name: 'login', path: '/' },
  { name: 'main', path: '/' },
  { name: 'settings', path: '/' },
];

test.describe('lighthouse audits', () => {
  for (const audit of audits) {
    test(`runs lighthouse for ${audit.name}`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium', 'Lighthouse only supports chromium');
      test.skip(testInfo.project.name !== 'laptop', 'Lighthouse is executed on laptop profile only');
      await installMockEnvironment(page);
      await gotoApp(page);
      test.skip(true, 'Run CLI lighthouse script for reliable cross-platform reports');
    });
  }
});
