import { test, expect } from '@playwright/test';

test.describe('Scoped styles', () => {
  test('the story CSS is in the head and the story markup comes first in the canvas', async ({ page }) => {
    await page.goto('/iframe.html?id=astro-scoped-styles-class-name-collision--same-class-name&viewMode=story');

    // Each title keeps its own component's color (issue #189).
    await expect(page.getByTestId('red-title')).toHaveCSS('color', 'rgb(198, 40, 40)');

    // Issue #224: the CSS no longer sits ahead of the markup in the canvas.
    const canvas = page.locator('#storybook-root');

    expect(await canvas.locator('style').count()).toBe(0);
    expect(await page.locator('head style[data-storybook-astro-styles]').count()).toBeGreaterThan(0);
  });

  // Issue #223: stylesheets imported in the frontmatter ship with the story.
  test('stylesheets a component imports in its frontmatter apply', async ({ page }) => {
    await page.goto('/iframe.html?id=astro-scoped-styles-imported-stylesheets--frontmatter-imports&viewMode=story');

    await expect(page.getByTestId('imported-styles-card')).toHaveCSS('border-top-color', 'rgb(106, 27, 154)');
    await expect(page.getByTestId('imported-styles-label')).toHaveCSS('color', 'rgb(239, 108, 0)');
  });

  // Issue #241: Vue and Svelte components rendered on the server ship their
  // <style> blocks.
  test('style blocks of server-rendered Vue and Svelte components apply', async ({ page }) => {
    await page.goto('/iframe.html?id=astro-scoped-styles-framework-style-blocks--server-rendered&viewMode=story');

    await expect(page.getByTestId('vue-scoped-badge')).toHaveCSS('color', 'rgb(46, 125, 50)');
    await expect(page.getByTestId('svelte-styled-tag')).toHaveCSS('color', 'rgb(21, 101, 192)');
  });
});
