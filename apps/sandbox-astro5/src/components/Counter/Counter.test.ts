import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { renderAstroStory } from '../../test-utils/renderAstroStory.ts';
import * as stories from './Counter.stories.jsx';

test('Astro Counter Default renders via SSR', async () => {
  await renderAstroStory(stories, 'Default');

  expect(screen.getByTestId('vanilla-counter')).toHaveTextContent('Astro counter: 1');
});
