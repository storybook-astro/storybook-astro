import { composeStories, setProjectAnnotations } from '@storybook/vue3';
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Accordion.stories.js';

setProjectAnnotations([
  // projectAnnotations
]);

const { Default } = composeStories(stories);

test('Vue Accordion Default runs with native renderer', async () => {
  await Default.run();

  expect(screen.getByTestId('vue-accordion')).toBeInTheDocument();
  expect(screen.getByText('Section 1')).toBeInTheDocument();
});
