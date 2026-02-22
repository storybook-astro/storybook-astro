import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { renderAstroStory } from '../../test-utils/renderAstroStory.ts';
import * as stories from './Card.stories.jsx';

test('Card Default renders via SSR', async () => {
  await renderAstroStory(stories, 'Default');

  expect(screen.getByText('Default title')).toBeInTheDocument();
  expect(screen.getByText('Default content')).toBeInTheDocument();
});

test('Card Highlight renders via SSR', async () => {
  await renderAstroStory(stories, 'Highlight');

  expect(screen.getByText('Highlighted Card')).toBeInTheDocument();
  expect(screen.getByText('This card has the highlight state enabled.')).toBeInTheDocument();
});
