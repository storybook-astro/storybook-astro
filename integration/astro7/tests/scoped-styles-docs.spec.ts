import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { navigateTo, previewStayedLoaded, tagPreview } from './navigation.ts';

const previewOf = (page: Page) => page.frameLocator('#storybook-preview-iframe');

/** The story CSS in the preview's head, as one string. */
const headCss = (preview: FrameLocator) =>
  preview
    .locator('head style[data-storybook-astro-styles]')
    .evaluateAll((styles) => styles.map((style) => style.textContent).join('\n'));

// Issue #224: a story's component CSS lives in the preview's head, so it has
// to leave with the story. The preview iframe stays loaded across SPA
// navigation, so a Docs page's CSS would otherwise keep applying on the next.
test.describe('Scoped styles across Docs pages', () => {
  test('leaving a Docs page removes its stories\' CSS from the head', async ({ page }) => {
    const preview = previewOf(page);

    await page.goto('/?path=/docs/astro-scoped-styles-class-name-collision--docs');
    await expect(preview.getByTestId('red-title').first()).toBeVisible({ timeout: 30_000 });
    expect(await headCss(preview)).toContain('.title[');

    // A Docs page with no Astro stories.
    await tagPreview(page);
    await navigateTo(page, '/docs/vue-accordion--docs');
    await expect(preview.locator('[data-testid="vue-accordion"]').first()).toBeVisible();

    await expect.poll(() => headCss(preview)).not.toContain('.title[');
    expect(await previewStayedLoaded(page)).toBe(true);
  });

  test('opening a Docs page removes the hidden story\'s CSS from the head', async ({ page }) => {
    const preview = previewOf(page);

    await page.goto('/?path=/story/astro-scoped-styles-class-name-collision--same-class-name');
    await expect(preview.getByTestId('red-title')).toBeVisible({ timeout: 30_000 });
    expect(await headCss(preview)).toContain('.title[');

    await tagPreview(page);
    await navigateTo(page, '/docs/vue-accordion--docs');
    await expect(preview.locator('[data-testid="vue-accordion"]').first()).toBeVisible();

    await expect.poll(() => headCss(preview)).not.toContain('.title[');
    expect(await previewStayedLoaded(page)).toBe(true);
  });
});

test.describe('Scoped styles across stories', () => {
  test('switching stories replaces the last story\'s CSS', async ({ page }) => {
    const preview = previewOf(page);

    await page.goto('/?path=/story/astro-scoped-styles-class-name-collision--same-class-name');
    await expect(preview.getByTestId('red-title')).toBeVisible({ timeout: 30_000 });
    expect(await headCss(preview)).toContain('.title[');

    // Straight to the next story. Clicking its component in the sidebar would
    // open the component's Docs page on the way.
    await tagPreview(page);
    await navigateTo(page, '/story/astro-scoped-styles-slotted-content--list-in-slot');
    await expect(preview.getByTestId('slot-list')).toBeVisible();

    await expect.poll(() => headCss(preview)).not.toContain('.title[');
    expect(await previewStayedLoaded(page)).toBe(true);
  });
});
