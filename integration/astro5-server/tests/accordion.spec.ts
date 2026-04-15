import { test, expect } from '@playwright/test';

test('Accordion toggles open', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-accordion--toggle-open&viewMode=story');

  const header = page.getByRole('button', { name: /Section 1/ });

  await expect(header).toHaveAttribute('aria-expanded', 'false');
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Content for section 1')).toBeVisible();
});

test('Accordion allows multiple open', async ({ page }) => {
  await page.goto('/iframe.html?id=astro-accordion--toggle-multiple&viewMode=story');

  const first = page.getByRole('button', { name: /First Item/ });
  const second = page.getByRole('button', { name: /Second Item/ });

  await first.click();
  await second.click();
  await expect(first).toHaveAttribute('aria-expanded', 'true');
  await expect(second).toHaveAttribute('aria-expanded', 'true');
});
