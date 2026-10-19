import { test, expect } from '@playwright/test';

// Regression test for #186: prerendering left a processed <script> pointing at
// its dev-server URL (`/<abs path>/Scripted.astro?astro&type=script&index=0&lang.ts`),
// so in the static build it 404'd and never ran.
test.describe('Scripted', () => {
  test('the component script and the module it imports run', async ({ page }) => {
    await page.goto('/iframe.html?id=astro-scripted--default&viewMode=story');

    await expect(page.getByTestId('scripted')).toHaveText('The component script ran.');
  });

  test('the prerendered HTML loads the script from a built chunk', async ({ request }) => {
    const stories = await (await request.get('/astro-prerendered-stories.json')).json();
    const html = stories['astro-scripted--default'];

    expect(html).toMatch(/<script type="module" src="\.\/_astro\/[^"]+\.js"><\/script>/);
    expect(html).not.toContain('?astro&type=script');
  });
});
