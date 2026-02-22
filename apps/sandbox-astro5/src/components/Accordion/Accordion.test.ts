import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Accordion.stories.jsx';

const { Default } = composeStories(stories);

test('Accordion Default renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByTestId('vanilla-accordion')).toBeInTheDocument();
  expect(screen.getByText('Section 1')).toBeInTheDocument();
});
