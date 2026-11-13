// The server-mode suite every astro{N}-server-{platform} app runs against its
// local preview, so each host's build serves the same Storybook and render API.
// Each app passes its own Playwright `test` and `expect`: Playwright refuses
// to run tests that import a second copy of itself.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { expect as playwrightExpect, test as playwrightTest } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const components = resolve(repoRoot, 'packages/components/src');
const githubStars = resolve(components, 'GithubStars/astro/GithubStars.astro');
const card = resolve(components, 'Card/astro/Card.astro');

function marker(moduleId: string) {
  return { __astroComponent: true, moduleId };
}

export function defineServerModeTests(test: typeof playwrightTest, expect: typeof playwrightExpect) {
  test.describe('Storybook', () => {
    test('a story renders through the render API with its mocked data', async ({ page }) => {
      await page.goto('/iframe.html?id=astro-githubstars--default&viewMode=story');

      await expect(page.getByTestId('github-stars')).toContainText('2,413');
    });

    test('changing an arg renders the story again on the server', async ({ page }) => {
      await page.goto(
        '/iframe.html?id=astro-npmweeklydownloads--default&viewMode=story&args=label:Custom+download+label'
      );

      await expect(page.getByTestId('npm-weekly-downloads')).toContainText('Custom download label');
    });

    test('a story ships its component styles', async ({ page }) => {
      await page.goto('/iframe.html?id=astro-githubstars--default&viewMode=story');

      // The card is a link; its CSS Module removes the browser's underline.
      await expect(page.getByTestId('github-stars')).toHaveCSS('text-decoration-line', 'none');
    });

    test('a story ships the styles of its decorator', async ({ page }) => {
      await page.goto('/iframe.html?id=astro-decorators-wrapper--decorated&viewMode=story');

      // Wrapper.astro's scoped <style> draws a dashed border.
      await expect(page.getByTestId('decorator-wrapper')).toHaveCSS('border-top-style', 'dashed');
    });

    test('a story rule can replace a module with another file', async ({ page }) => {
      // The hundred-k story's rule mocks the GitHub client with a replacement path.
      await page.goto('/iframe.html?id=astro-githubstars--hundred-k&viewMode=story');

      await expect(page.getByTestId('github-stars')).toContainText('100,000');
    });

    test('a decorator wraps the story', async ({ page }) => {
      await page.goto('/iframe.html?id=astro-decorators-wrapper--decorated&viewMode=story');

      await expect(page.getByText('Wrapped in preview')).toBeVisible();
    });

    test('an island hydrates from the built assets', async ({ page }) => {
      await page.goto('/iframe.html?id=astro-githubstars--one-k&viewMode=story');

      // The count animates up from 0 only once the Preact island has hydrated.
      await expect(page.getByTestId('github-stars')).toContainText('1,000');
      await expect(page.locator('astro-island:not([ssr])')).toHaveCount(1);
    });
  });

  test.describe('render API', () => {
    test('answers a health check', async ({ request }) => {
      const response = await request.get('/api');

      expect(response.status()).toBe(200);
      expect(await response.text()).toBe('OK');
    });

    test('a decorator can fill any number of named slots', async ({ request }) => {
      // Components are addressed by the module ids of the machine that built
      // the app; this suite only knows them for a build on this machine.
      test.skip(Boolean(process.env.STORYBOOK_URL), 'needs the module ids of a local build');

      const extraSlots = Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [`extra-${index}`, `<i>extra ${index}</i>`])
      );
      const response = await request.post('/api/render', {
        data: {
          component: card,
          args: { title: 'Card in a layout' },
          node: {
            component: marker(resolve(components, 'Decorator/LayoutWithSlots.astro')),
            slots: { default: marker(card), sidebar: '<p>Sidebar content</p>', ...extraSlots },
          },
          story: { id: 'astro-decorators-advanced--named-slot-wrapped' },
        },
      });
      const html = await response.text();

      expect(response.status(), html).toBe(200);
      expect(html).toContain('Card in a layout');
      expect(html).toContain('Sidebar content');
    });

    test('rejects a malformed decorator node', async ({ request }) => {
      const response = await request.post('/api/render', {
        data: { component: 'x', node: 42 },
      });

      expect(response.status()).toBe(400);
    });

    test('render pages answer only through the render API', async ({ request }) => {
      // Requested directly, a render page would skip the API's auth and story rules.
      const response = await request.post('/storybook-astro/render/0', {
        data: { component: githubStars },
      });

      expect(response.status()).toBe(404);
    });
  });
}
