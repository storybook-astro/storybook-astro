import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Footer.stories.jsx';

const { Default } = composeStories(stories);

test('Footer Default renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByText('Licensed under MIT')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'GitHub Project' })).toBeInTheDocument();
});
