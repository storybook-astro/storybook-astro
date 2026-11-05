import type { Page } from '@playwright/test';

/**
 * Switches the preview to another story or Docs page the way the manager's
 * sidebar does, by emitting `setCurrentStory` on its channel, so the preview
 * iframe stays loaded across the switch. Clicking the sidebar itself isn't
 * stable across Storybook majors: Storybook 11's sidebar dropped the element
 * ids Storybook 10's had.
 */
export async function showInPreview(page: Page, storyId: string) {
  const viewMode = storyId.endsWith('--docs') ? 'docs' : 'story';

  await page.evaluate(
    ({ storyId, viewMode }) =>
      (
        window as typeof window & {
          __STORYBOOK_ADDONS_CHANNEL__: { emit: (event: string, data: unknown) => void };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__.emit('setCurrentStory', { storyId, viewMode }),
    { storyId, viewMode }
  );
}
