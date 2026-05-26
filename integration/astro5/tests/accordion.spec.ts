import { test, expect } from '@playwright/test';

test('Accordion toggles open', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-accordion--toggle-open&viewMode=story');
  // The story's play function clicks the header; verify the resulting state
  await expect(page.getByRole('button', { name: /Section 1/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Content for section 1')).toBeVisible();
});

test('Accordion allows multiple open', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-accordion--toggle-multiple&viewMode=story');
  // The story's play function clicks both headers; verify both are expanded
  await expect(page.getByRole('button', { name: /First Item/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: /Second Item/ })).toHaveAttribute('aria-expanded', 'true');
});
