/**
 * Static-build-only assertions for ImageText.
 *
 * These checks only make sense against the built storybook-static/ output
 * (via playwright.static.config.ts). In the dev server, /@fs/ image paths
 * are valid and served by Vite — the rewriting to /_astro/ content-hashed
 * paths only happens during the static prerender step.
 */
import { test, expect } from '@playwright/test';

test('ImageText image src is rewritten from /@fs/ to a hashed asset path', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-imagetext--default&viewMode=story');

  const img = page.locator('.image-container img');

  await expect(img).toBeVisible();

  const src = await img.getAttribute('src');

  // /@fs/ URLs only work on the Vite dev server. In the static build they
  // must be rewritten to the content-hashed /_astro/... output path.
  expect(src).not.toContain('/@fs/');
  expect(src).toMatch(/\/_astro\/.+\.(png|jpe?g|gif|webp|svg|avif)/);
});
