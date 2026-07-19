import { composeStories, setProjectAnnotations } from '@storybook/vue3';
import { screen, within } from '@testing-library/dom';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Counter.stories.js';

setProjectAnnotations([
  // projectAnnotations
]);

const { Default, WithDecorator } = composeStories(stories);

test('Vue Counter Default runs with native renderer', async () => {
  await Default.run();

  expect(screen.getByTestId('vue-counter')).toHaveTextContent('Vue counter: 1');
});

// Issue #40 (Step 1): a story-level decorator, written in Vue 3's native
// format, must wrap the rendered output through the delegated Vue renderer.
test('Vue Counter WithDecorator is wrapped by its story-level decorator', async () => {
  await WithDecorator.run();

  const wrapper = screen.getByTestId('story-decorator');

  expect(wrapper).toHaveClass('decorator-story-level');
  expect(within(wrapper).getByTestId('vue-counter')).toHaveTextContent('Vue counter: 1');
});
