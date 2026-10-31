import { test, expect } from '@playwright/test';

// The Docs props table lists a component's slots, with the description from
// its `@slot` comment, whether or not a story passes slot content (issue #188).
test.describe('Slots in the Docs props table', () => {
  test('ImageText lists its default slot with its description', async ({ page }) => {
    await page.goto('/iframe.html?viewMode=docs&id=astro-imagetext--docs');

    const table = page.locator('.docblock-argstable').first();

    await expect(table).toBeVisible();
    await expect(table).toContainText(/slots/i);

    const slotRow = table.locator('tr', { hasText: 'The text column, shown beside the image' });

    await expect(slotRow).toContainText('default');
    await expect(slotRow).toContainText('default slot');
  });
});
