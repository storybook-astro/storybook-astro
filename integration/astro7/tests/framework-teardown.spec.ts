import { test, expect, type FrameLocator } from '@playwright/test';
import { navigateTo, previewStayedLoaded, tagPreview } from './navigation.ts';

// A story delegated to a framework is unmounted when Storybook removes it, so
// its effects clean up (#238). Before, the renderer dropped the framework's
// teardown and the React root stayed mounted until a reload.
//
// React marks a container it renders into with a `__reactContainer$…` key,
// and clears that key when the root unmounts.

function storyCanvasHoldsReactRoot(preview: FrameLocator) {
  return preview.locator('#storybook-root').evaluate((canvas) =>
    Object.keys(canvas).some(
      (key) => key.startsWith('__reactContainer$') && (canvas as unknown as Record<string, unknown>)[key]
    )
  );
}

test.describe('leaving a framework story', () => {
  test('unmounts a React story when the reader moves to an Astro story', async ({ page }) => {
    const preview = page.frameLocator('#storybook-preview-iframe');

    await page.goto('/?path=/story/react-counter--default');
    await expect(preview.getByTestId('react-counter')).toBeVisible({ timeout: 30_000 });
    expect(await storyCanvasHoldsReactRoot(preview)).toBe(true);

    await tagPreview(page);
    await navigateTo(page, '/story/astro-counter--default');
    await expect(preview.getByTestId('vanilla-counter')).toBeVisible();

    expect(await storyCanvasHoldsReactRoot(preview)).toBe(false);
    expect(await previewStayedLoaded(page)).toBe(true);
  });

  test('moves between React and Astro Docs pages without errors', async ({ page }) => {
    const errors: string[] = [];
    const preview = page.frameLocator('#storybook-preview-iframe');

    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/?path=/docs/react-counter--docs');
    await expect(preview.getByTestId('react-counter').first()).toBeVisible({ timeout: 30_000 });

    await tagPreview(page);
    await navigateTo(page, '/docs/astro-counter--docs');
    await expect(preview.getByTestId('vanilla-counter').first()).toBeVisible();
    await navigateTo(page, '/story/react-counter--default');
    await expect(preview.getByTestId('react-counter')).toHaveCount(1);
    await navigateTo(page, '/story/astro-counter--default');
    await expect(preview.getByTestId('vanilla-counter')).toHaveCount(1);

    expect(await storyCanvasHoldsReactRoot(preview)).toBe(false);
    expect(await previewStayedLoaded(page)).toBe(true);
    expect(errors).toEqual([]);
  });
});
