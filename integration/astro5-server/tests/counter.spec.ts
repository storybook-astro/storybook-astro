import { test, expect } from '@playwright/test';

test('Counter increments on click', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-counter--click-increment&viewMode=story');
  await page.waitForSelector('[data-testid="vanilla-counter"]');

  await page.getByRole('button', { name: '+1' }).click();
  await expect(page.getByTestId('vanilla-counter')).toContainText('Astro counter: 2');
});
