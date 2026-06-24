import { test, expect } from '@playwright/test';

// Regression test for a stale component left over when switching frameworks via
// Docs pages. The renderer used to track the "active renderer" in one module
// global; a Docs page renders stories into their own canvases, which polluted
// that global so the shared story canvas wasn't cleared when a different
// framework's story reused it — leaving two components (e.g. Vue + Svelte
// Accordion) stacked until a reload. Tracking the renderer per canvas fixes it.
//
// This must drive the manager (not /iframe.html) because the bug only appears
// across SPA navigation that doesn't reload the preview iframe.
test.describe('framework switch through Docs pages', () => {
  test('navigating Vue→Svelte via Docs leaves only one component', async ({ page }) => {
    const preview = page.frameLocator('#storybook-preview-iframe');

    // Single full load: start on the Vue Accordion Docs page.
    await page.goto('/?path=/docs/vue-accordion--docs');
    await expect(preview.locator('[data-testid="vue-accordion"]').first()).toBeVisible({
      timeout: 30_000
    });

    // SPA navigation (no iframe reload) following the reported sequence:
    // Vue docs -> Vue story -> Svelte docs -> Svelte story.
    await page.locator('#vue-accordion--default').click();
    await expect(preview.locator('.accordion')).toHaveCount(1);

    await page.locator('#svelte-accordion').click(); // expand the Svelte group
    await page.locator('#svelte-accordion--docs').click();
    await expect(preview.locator('[data-testid="svelte-accordion"]').first()).toBeVisible();

    await page.locator('#svelte-accordion--default').click();

    // The Svelte story canvas must contain exactly one accordion — no leftover
    // Vue accordion from the earlier story.
    await expect(preview.locator('.accordion')).toHaveCount(1);
    await expect(preview.locator('[data-testid="svelte-accordion"]')).toHaveCount(1);
    await expect(preview.locator('[data-testid="vue-accordion"]')).toHaveCount(0);
  });
});
