import { test, expect } from '@playwright/test';

// Regression test for #186: an image a component imports itself only ever
// reaches the server-side render, so its prerendered /@fs/ URL had no emitted
// asset to be rewritten to and 404'd in the static build.
test.describe('Logo', () => {
  for (const testId of ['logo-image', 'logo-url']) {
    test(`${testId} loads from the build output`, async ({ page }) => {
      await page.goto('/iframe.html?id=astro-logo--default&viewMode=story');

      const img = page.getByTestId(testId);

      await expect(img).toHaveAttribute('src', /^\/_astro\/.+\.png$/);
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0);
    });
  }

  test('the prerendered HTML has no dev-server image URLs left', async ({ request }) => {
    const stories = await (await request.get('/astro-prerendered-stories.json')).json();

    expect(stories['astro-logo--default']).not.toContain('/@fs/');
  });
});
