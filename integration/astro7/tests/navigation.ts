import type { Page } from '@playwright/test';

/**
 * Navigates the manager to another story or Docs page without reloading the
 * preview iframe, as clicking it in the sidebar does: it changes the manager's
 * URL and lets its router handle the change, so the URL, the sidebar and the
 * preview all move together. `path` is the `?path=` value, such as
 * `/docs/vue-accordion--docs` or `/story/vue-accordion--default`.
 *
 * Clicking the sidebar itself isn't stable across Storybook majors: Storybook
 * 11's sidebar dropped the element ids Storybook 10's had.
 */
export async function navigateTo(page: Page, path: string) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', `?path=${path}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/**
 * Tags the preview iframe's window so `previewStayedLoaded` can tell whether
 * it reloaded since. The Docs-page regressions only show up while the preview
 * stays loaded; after a reload these tests would pass whatever the renderer
 * does.
 */
export async function tagPreview(page: Page) {
  await page
    .frameLocator('#storybook-preview-iframe')
    .locator('body')
    .evaluate(() => {
      (window as typeof window & { __previewTag?: boolean }).__previewTag = true;
    });
}

export async function previewStayedLoaded(page: Page) {
  return page
    .frameLocator('#storybook-preview-iframe')
    .locator('body')
    .evaluate(() => (window as typeof window & { __previewTag?: boolean }).__previewTag === true);
}
