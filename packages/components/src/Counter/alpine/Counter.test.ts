import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Counter.stories.js';

const { Default } = composeStories(stories);

test('Alpine Counter Default renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByText('Alpine counter:')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+1' })).toBeInTheDocument();
});
