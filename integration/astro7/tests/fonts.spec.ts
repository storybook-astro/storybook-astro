import { test, expect } from '@playwright/test';

// Fonts declared in astro.config are in the iframe head in a static build, and
// a story that renders <Font> doesn't ship a second copy (issue #248).
test.describe('Fonts', () => {
  test('the head defines the font, and <Font> in the story adds no copy of its CSS', async ({ page }) => {
    await page.goto('/iframe.html?id=astro-fontdemo--default&viewMode=story');

    await expect(page.getByTestId('font-demo')).toHaveCSS('font-family', /Inter/);
    const headFontCss = await page.locator('head style[data-storybook-astro-fonts]').evaluate((style) => style.textContent);

    expect(headFontCss).toContain('@font-face');

    const canvasFontCss = await page
      .locator('#storybook-root style')
      .evaluateAll((styles) => styles.map((style) => style.textContent ?? '').join(''));

    expect(canvasFontCss).not.toContain('@font-face');
  });
});
