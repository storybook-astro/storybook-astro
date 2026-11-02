import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from '@storybook-astro/components/ScopedStyles/FrameworkStyles.stories.jsx';

const { ServerRendered } = composeStories(stories);

function storyCss() {
  return Array.from(document.querySelectorAll('style[data-storybook-astro-styles]'))
    .map((style) => style.textContent)
    .join('\n');
}

// Issue #241: a Vue or Svelte component an Astro story renders on the server
// ships its <style> block, scoped the way its markup is.
test('server-rendered Vue and Svelte components ship their style blocks', async () => {
  await renderStory(ServerRendered);

  const badge = screen.getByTestId('vue-scoped-badge');
  const vueScope = badge.getAttributeNames().find((name) => name.startsWith('data-v-'));
  const svelteScope = [...screen.getByTestId('svelte-styled-tag').classList].find((name) =>
    name.startsWith('svelte-')
  );

  expect(vueScope).toBeDefined();
  expect(storyCss()).toContain(`.badge[${vueScope}]`);
  expect(svelteScope).toBeDefined();
  expect(storyCss()).toContain(`.tag.${svelteScope}`);
});
