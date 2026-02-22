import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Header.stories.jsx';

const { Default } = composeStories(stories);

test('Header Default renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByText('Storybook Astro')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
});
