import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// This file lives at integration/astro5-server/tests/, so the repo root is
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
