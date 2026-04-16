import { expect, type Locator, type Page } from '@playwright/test';

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBeFalsy();
}

export async function expectVisible(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
}
