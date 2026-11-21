import { test, expect } from '@playwright/test';

test('GithubStars default story renders the mocked star count', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-githubstars--default&viewMode=story');

  await expect(page.getByTestId('github-stars')).toContainText('2,413');
});

test('NpmWeeklyDownloads label re-renders on demand when args change', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-npmweeklydownloads--default&viewMode=story');

  await expect(page.getByTestId('npm-weekly-downloads')).toContainText('npm weekly downloads');

  // Astro components are server-rendered — changing an arg forces a fresh
  // render request to the render server rather than a client-side re-render.
  await page.goto(
    '/iframe.html?id=astro-npmweeklydownloads--default&viewMode=story&args=label:Custom+download+label'
  );

  await expect(page.getByTestId('npm-weekly-downloads')).toContainText('Custom download label');
});

test('Decorator story renders its Astro wrapper', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-decorators-wrapper--decorated&viewMode=story');

  await expect(page.getByText('Wrapped in preview')).toBeVisible();
});

// Framework (non-Astro) stories are delegated to their own renderer even in a
// server-mode build — this proves client-side hydration still works when the
// Astro stories in the same Storybook are served by the render server.
test('React Counter increments on click', async ({ page }) => {
  await page.goto('/iframe.html?id=react-counter--default&viewMode=story');

  const counter = page.getByTestId('react-counter');

  await expect(counter).toContainText('React counter: 1');
  await counter.getByRole('button', { name: '+1' }).click();
  await expect(counter).toContainText('React counter: 2');
});

test('Preact Counter increments on click', async ({ page }) => {
  await page.goto('/iframe.html?id=preact-counter--default&viewMode=story');

  const counter = page.getByTestId('preact-counter');

  await expect(counter).toContainText('Preact counter: 1');
  await counter.getByRole('button', { name: '+1' }).click();
  await expect(counter).toContainText('Preact counter: 2');
});
