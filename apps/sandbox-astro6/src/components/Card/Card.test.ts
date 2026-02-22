import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Card.stories.jsx';

const { Default, Highlight } = composeStories(stories);

test('Card Default renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByText('Default title')).toBeInTheDocument();
  expect(screen.getByText('Default content')).toBeInTheDocument();
});

test('Card Highlight renders via SSR', async () => {
  await renderStory(Highlight);

  expect(screen.getByText('Highlighted Card')).toBeInTheDocument();
  expect(screen.getByText('This card has the highlight state enabled.')).toBeInTheDocument();
});
