import { test, expect, type FrameLocator } from '@playwright/test';
import { navigateTo, previewStayedLoaded, tagPreview } from './navigation.ts';

// A story delegated to a framework is unmounted when Storybook removes it, so
// its effects clean up (#238). Before, the renderer dropped the framework's
// teardown and the React root stayed mounted until a reload.
//
// React marks a container it renders into with a `__reactContainer$…` key,
// and clears that key when the root unmounts.

function holdsReactRoot(canvas: Element) {
  return Object.keys(canvas).some(
    (key) => key.startsWith('__reactContainer$') && (canvas as unknown as Record<string, unknown>)[key]
  );
}

function storyCanvasHoldsReactRoot(preview: FrameLocator) {
  return preview.locator('#storybook-root').evaluate(holdsReactRoot);
}

// A Docs page renders each story into its own block canvas, such as
// `#story--react-counter--default--primary-inner`.
const reactCounterDocsCanvases = '[id^="story--react-counter--"][id$="-inner"]';

test.describe('leaving a framework story', () => {
  test('unmounts a React story when the reader moves to an Astro story', async ({ page }) => {
    const preview = page.frameLocator('#storybook-preview-iframe');

    await page.goto('/?path=/story/react-counter--default');
    await expect(preview.getByTestId('react-counter')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => storyCanvasHoldsReactRoot(preview)).toBe(true);

    await tagPreview(page);
    await navigateTo(page, '/story/astro-counter--default');
    await expect(preview.getByTestId('vanilla-counter')).toBeVisible();

    expect(await storyCanvasHoldsReactRoot(preview)).toBe(false);
    expect(await previewStayedLoaded(page)).toBe(true);
  });

  test('moves between React and Astro Docs pages without errors', async ({ page }) => {
    const errors: string[] = [];
    const preview = page.frameLocator('#storybook-preview-iframe');

    // The preview's errors, such as a removeChild DOMException from a late
    // teardown. A message's location is the script that logged it, such as
    // react-dom or the renderer chunk, so only the manager's own scripts are
    // left out: its addons log errors of their own.
    page.on('console', (message) => {
      const loggedBy = message.location().url;

      if (
        message.type() === 'error' &&
        !loggedBy.includes('/sb-manager/') &&
        !loggedBy.includes('/sb-addons/') &&
        !message.text().startsWith('Failed to load resource')
      ) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/?path=/docs/react-counter--docs');
    await expect(preview.getByTestId('react-counter').first()).toBeVisible({ timeout: 30_000 });

    // Handles to the Docs page's story-block canvases. A handle still reaches
    // its canvas after leaving the page removes it from the document, so the
    // test can check that each block's React root was unmounted, not just
    // dropped along with the page.
    const previewFrame = page.frame({ url: /iframe\.html/ });
    const docsCanvases = (await previewFrame?.$$(reactCounterDocsCanvases)) ?? [];

    expect(docsCanvases.length).toBeGreaterThan(0);
    for (const canvas of docsCanvases) {
      // React mounts each Docs block through a serial queue, so a later
      // block's root may not exist yet when the first block is visible.
      await expect.poll(() => canvas.evaluate(holdsReactRoot)).toBe(true);
    }

    await tagPreview(page);
    await navigateTo(page, '/docs/astro-counter--docs');
    await expect(preview.getByTestId('vanilla-counter').first()).toBeVisible();
    for (const canvas of docsCanvases) {
      await expect.poll(() => canvas.evaluate(holdsReactRoot)).toBe(false);
    }
    await navigateTo(page, '/story/react-counter--default');
    await expect(preview.getByTestId('react-counter')).toHaveCount(1);
    await navigateTo(page, '/story/astro-counter--default');
    await expect(preview.getByTestId('vanilla-counter')).toHaveCount(1);

    expect(await storyCanvasHoldsReactRoot(preview)).toBe(false);
    expect(await previewStayedLoaded(page)).toBe(true);
    expect(errors).toEqual([]);
  });
});
