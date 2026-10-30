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

    test('applies a story rule that mocks a module with a factory', async ({ request }) => {
      const response = await request.post('/api/render', {
        data: {
          component: githubStars,
          args: { repository: 'storybook-astro/storybook-astro' },
          story: { id: 'astro-githubstars--default', title: 'Astro/GitHubStars', name: 'Default' },
        },
      });

      expect(response.status()).toBe(200);
      expect(await response.text()).toContain('2,413 GitHub stars');
    });

    test('applies a story rule that mocks a module with a replacement path', async ({ request }) => {
      const response = await request.post('/api/render', {
        data: {
          component: githubStars,
          args: { repository: 'storybook-astro/storybook-astro' },
          story: { id: 'astro-githubstars--hundred-k', title: 'Astro/GitHubStars', name: 'Hundred K' },
        },
      });

      expect(response.status()).toBe(200);
      expect(await response.text()).toContain('100,000 GitHub stars');
    });

    test('a decorator can fill any number of named slots', async ({ request }) => {
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
