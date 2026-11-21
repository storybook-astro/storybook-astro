import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// This file lives at integration/astro7-server/tests/, so the repo root is
// three levels up — resolved at runtime instead of hardcoded so the test
// doesn't bake in a machine-specific absolute path.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const githubStarsComponent = resolve(
  repoRoot,
  'packages/components/src/GithubStars/astro/GithubStars.astro'
);

test('GET /api returns OK', async ({ request }) => {
  const response = await request.get('/api');

  expect(response.status()).toBe(200);
  expect(await response.text()).toBe('OK');
});

test('POST /api/render renders the mocked GithubStars story', async ({ request }) => {
  const response = await request.post('/api/render', {
    data: {
      component: githubStarsComponent,
      args: {
        repository: 'storybook-astro/storybook-astro',
        label: 'GitHub stars',
      },
      slots: {},
      story: {
        id: 'astro-githubstars--default',
        title: 'Astro/GitHubStars',
        name: 'Default',
      },
    },
  });

  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('2413');
});

test('POST /api/render rejects a malformed decorator node', async ({ request }) => {
  const response = await request.post('/api/render', {
    data: {
      component: 'x',
      args: {},
      slots: {},
      node: 42,
    },
  });

  expect(response.status()).toBe(400);
});

test('render pages are reachable only through the render API', async ({ request }) => {
  // Requested directly, a render page would skip the API's auth and story rules.
  const response = await request.post('/storybook-astro/render/0', {
    data: { component: githubStarsComponent, args: {}, slots: {} },
  });

  expect(response.status()).toBe(404);
});

test('a decorator can fill any number of named slots', async ({ request }) => {
  const decorators = resolve(repoRoot, 'packages/components/src/Decorator');
  const marker = (file: string) => ({ __astroComponent: true, moduleId: resolve(decorators, file) });
  // LayoutWithSlots reads `default` and `sidebar`; the other slots it ignores
  // still have to reach it without failing the render.
  const extraSlots = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [`extra-${index}`, `<i>extra ${index}</i>`])
  );
  const response = await request.post('/api/render', {
    data: {
      component: resolve(repoRoot, 'packages/components/src/Card/astro/Card.astro'),
      args: { title: 'Card in a layout' },
      slots: {},
      node: {
        component: marker('LayoutWithSlots.astro'),
        slots: {
          default: { __astroComponent: true, moduleId: resolve(repoRoot, 'packages/components/src/Card/astro/Card.astro') },
          sidebar: '<p>Sidebar content</p>',
          ...extraSlots,
        },
      },
      story: { id: 'astro-decorators-advanced--named-slot-wrapped' },
    },
  });
  const html = await response.text();

  expect(response.status(), html).toBe(200);
  expect(html).toContain('Card in a layout');
  expect(html).toContain('Sidebar content');
});
