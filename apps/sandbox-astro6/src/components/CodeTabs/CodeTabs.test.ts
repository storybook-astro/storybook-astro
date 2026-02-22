import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './CodeTabs.stories.jsx';

const { Default } = composeStories(stories);

test('Astro CodeTabs renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByTestId('astro-code-tabs')).toBeInTheDocument();
  expect(screen.getByText('npm install -D storybook @storybook/builder-vite @storybook-astro/framework')).toBeInTheDocument();
});
