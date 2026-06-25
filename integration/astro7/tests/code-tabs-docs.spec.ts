import { test, expect } from '@playwright/test';

// Regression test for the Docs page stomping per-story stylesheets.
//
// The CodeTabs Docs page renders every CodeTabs story (react, solid, vue, …)
// into one shared iframe head. Each framework ships its own stylesheet, so the
// stylesheet sync must keep them all — previously a later story removed earlier
// stories' links, leaving most CodeTabs instances unstyled on Docs (they were
// fine on individual Canvas story pages).
test.describe('CodeTabs on the Docs page', () => {
  test('react CodeTabs keeps its styling alongside the other framework stories', async ({ page }) => {
    await page.goto('/iframe.html?viewMode=docs&id=astro-code-tabs--docs');

    // The Docs page renders all stories; the react implementation appears in
    // multiple stories (Default + React (client:load)).
    const reactTabs = page.locator('[data-testid="react-code-tabs"]').first();

    await expect(reactTabs).toBeVisible();

    // `.installTabs` from the CSS module sets a 10px radius. If the stylesheet
    // was stripped by a later story's render, this falls back to the default 0px.
    await expect
      .poll(async () => reactTabs.evaluate((el) => getComputedStyle(el).borderTopLeftRadius))
      .toBe('10px');

    // The tablist uses `display: flex` from the same module.
    const tablist = page.locator('[data-testid="react-code-tabs"] [role="tablist"]').first();

    await expect(tablist).toHaveCSS('display', 'flex');
  });
});
