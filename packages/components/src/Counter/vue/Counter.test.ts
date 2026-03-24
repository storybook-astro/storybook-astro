import { composeStories, setProjectAnnotations } from '@storybook/vue3';
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Counter.stories.js';

setProjectAnnotations([
  // projectAnnotations
]);

const { Default } = composeStories(stories);

test('Vue Counter Default runs with native renderer', async () => {
  await Default.run();

  expect(screen.getByTestId('vue-counter')).toHaveTextContent('Vue counter: 1');
});
