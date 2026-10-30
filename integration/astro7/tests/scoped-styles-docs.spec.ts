import { test, expect } from '@playwright/test';

// Issue #224: a story's component CSS lives in the preview's head, so it has
// to leave with the story. The preview iframe stays loaded across SPA
// navigation, so a Docs page's CSS would otherwise keep applying on the next.
test.describe('Scoped styles across Docs pages', () => {
  test('leaving a Docs page removes its stories\' CSS from the head', async ({ page }) => {
    const preview = page.frameLocator('#storybook-preview-iframe');
    const headCss = () =>
      preview
        .locator('head style[data-storybook-astro-styles]')
        .evaluateAll((styles) => styles.map((style) => style.textContent).join('\n'));

    await page.goto('/?path=/docs/astro-scoped-styles-class-name-collision--docs');
    await expect(preview.getByTestId('red-title').first()).toBeVisible({ timeout: 30_000 });
    expect(await headCss()).toContain('.title[');

    // A Docs page with no Astro stories.
    await page.locator('#vue-accordion').click();
    await page.locator('#vue-accordion--docs').click();
    await expect(preview.locator('[data-testid="vue-accordion"]').first()).toBeVisible();

    await expect.poll(headCss).not.toContain('.title[');
  });
});

test.describe('Scoped styles across stories', () => {
  test('the old story stays on screen until the next one replaces it', async ({ page }) => {
    const preview = page.frameLocator('#storybook-preview-iframe');

    await page.goto('/?path=/story/astro-scoped-styles-class-name-collision--same-class-name');
    await expect(preview.getByTestId('red-title')).toBeVisible({ timeout: 30_000 });

    // Records whether the canvas is ever empty while the next story renders.
    await preview.locator('#storybook-root').evaluate((root) => {
      const observedWindow = window as typeof window & { canvasWentBlank?: boolean };

      observedWindow.canvasWentBlank = false;
      new MutationObserver(() => {
        if (root.childElementCount === 0) {
          observedWindow.canvasWentBlank = true;
        }
      }).observe(root, { childList: true });
    });

    // Straight to the next story. Clicking its component in the sidebar would
    // open the component's Docs page on the way.
    await page.evaluate(() =>
      (
        window as typeof window & {
          __STORYBOOK_ADDONS_CHANNEL__: { emit: (event: string, data: unknown) => void };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__.emit('setCurrentStory', {
        storyId: 'astro-scoped-styles-slotted-content--list-in-slot',
        viewMode: 'story'
      })
    );
    await expect(preview.getByTestId('slot-list')).toBeVisible();

    const canvasWentBlank = await preview
      .locator('#storybook-root')
      .evaluate(() => (window as typeof window & { canvasWentBlank?: boolean }).canvasWentBlank);

    expect(canvasWentBlank).toBe(false);
  });
});
