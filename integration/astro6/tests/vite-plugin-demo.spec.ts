import { test, expect } from '@playwright/test';

// Islands are bundled by a separate asset build, which used to run without
// the project's astro.config vite plugins (issue #169). In the static output
// that produced an island chunk that never resolved the plugin's virtual
// module, so the component rendered but could not hydrate.
test.describe('VitePluginDemo', () => {
  test('a project vite plugin resolves in the prerendered HTML', async ({ page }) => {
    await page.goto('/iframe.html?id=astro-vite-plugin-demo--default&viewMode=story');

    await expect(page.getByTestId('vite-plugin-astro')).toHaveText(
      'Served by the project Vite plugin'
    );
  });

  test('a project vite plugin resolves in the island bundle, and the island hydrates', async ({
    page,
  }) => {
    await page.goto('/iframe.html?id=astro-vite-plugin-demo--default&viewMode=story');

    const island = page.getByTestId('vite-plugin-island');

    await expect(island).toContainText('Served by the project Vite plugin');

    await island.click();

    await expect(island).toContainText('clicks: 1');
  });
});
