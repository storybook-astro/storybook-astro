import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './VitePluginDemo.stories.jsx';

const { Default } = composeStories(stories);

// The SSR render server is one of the pipelines that used to miss the
// project's astro.config vite plugins (issue #169) — without them the
// virtual module the component imports never resolves.
test('a project vite plugin resolves in the SSR render server', async () => {
  await renderStory(Default);

  expect(screen.getByTestId('vite-plugin-astro')).toHaveTextContent(
    'Served by the project Vite plugin'
  );
});
