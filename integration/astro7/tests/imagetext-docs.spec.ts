import { test, expect } from '@playwright/test';

// Regression test for Storybook's docs typography bleeding into rendered stories.
//
// On the Docs page a story renders inside `.sbdocs-content`, whose typography
// rules previously restyled native elements in the component (e.g. an <h2> in
// slot content took Storybook's docs heading color instead of its own). The
// canvas container is now tagged `.sb-unstyled` in docs view, which Storybook
// exempts from that typography — so the component looks the same on Docs as on
// the individual Canvas story page.
test.describe('ImageText on the Docs page', () => {
  test('slot heading keeps the same color on Docs as on Canvas', async ({ page }) => {
    const colorOf = async (selector: string) =>
      page.locator(selector).first().evaluate((el) => getComputedStyle(el).color);

    await page.goto('/iframe.html?viewMode=story&id=astro-imagetext--default');
    await expect(page.locator('.image-text h2').first()).toBeVisible();
    const canvasColor = await colorOf('.image-text h2');

    await page.goto('/iframe.html?viewMode=docs&id=astro-imagetext--docs');
    await expect(page.locator('.image-text h2').first()).toBeVisible();
    const docsColor = await colorOf('.image-text h2');

    expect(docsColor).toBe(canvasColor);
  });
});
