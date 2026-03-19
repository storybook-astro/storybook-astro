import { composeStories, setProjectAnnotations } from '@storybook/svelte';
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Counter.stories.js';

setProjectAnnotations([
  // projectAnnotations
]);

const { Default } = composeStories(stories);

test('Svelte Counter Default runs with native renderer', async () => {
  await Default.run();

  expect(screen.getByTestId('svelte-counter')).toHaveTextContent('Svelte counter: 1');
});
