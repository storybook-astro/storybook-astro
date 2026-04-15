import { test, expect } from '@playwright/test';

test('Counter increments on click', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-counter--click-increment&viewMode=story');
  // The story's play function clicks the button; wait for the resulting state
  await expect(page.getByTestId('vanilla-counter')).toContainText('Astro counter: 2');
});
