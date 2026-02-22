import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Accordion.stories.js';

const { Default } = composeStories(stories);

test('Alpine Accordion Default renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByRole('button', { name: /Section 1/ })).toBeInTheDocument();
  expect(screen.getByText('Content for section 1')).toBeInTheDocument();
});
