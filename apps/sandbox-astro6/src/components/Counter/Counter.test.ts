import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Counter.stories.jsx';

const { Default } = composeStories(stories);

test('Astro Counter Default renders via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByTestId('vanilla-counter')).toHaveTextContent('Astro counter: 1');
});
