import { test, expect } from '@playwright/test';

test.describe('ImageText', () => {
  test('image loads and is visible', async ({ page }) => {
    await page.goto('/iframe.html?id=astro-imagetext--default&viewMode=story');

    const img = page.locator('.image-container img');

    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('alt', 'Astro Storybook Earth');

    // Image should actually load (naturalWidth > 0), not show as a broken icon.
    // Note: /@fs/ paths are valid in the dev server — the static-build-only
    // assertion lives in playwright.static.config.ts tests instead.
    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);

    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('slot HTML renders as elements, not escaped text', async ({ page }) => {
    await page.goto('/iframe.html?id=astro-imagetext--default&viewMode=story');

    // The default slot contains <h2> and <p> elements. If the rendering
    // pipeline escapes the slot HTML, they appear as literal "&lt;h2&gt;"
    // text instead of actual DOM elements.
    const heading = page.locator('.text-container h2');

    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Welcome to Storybook Astro');

    const paragraph = page.locator('.text-container p');

    await expect(paragraph).toBeVisible();
    await expect(paragraph).toContainText('Experience the power of Astro components');

    // Ensure no raw HTML tags leaked as visible text
    const textContent = await page.locator('.text-container').textContent();

    expect(textContent).not.toContain('<h2>');
    expect(textContent).not.toContain('</h2>');
    expect(textContent).not.toContain('<p>');
    expect(textContent).not.toContain('</p>');
  });
});
