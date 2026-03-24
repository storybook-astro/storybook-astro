import { composeStories, setProjectAnnotations } from '@storybook/svelte';
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Accordion.stories.js';

setProjectAnnotations([
  // projectAnnotations
]);

const { Default } = composeStories(stories);

test('Svelte Accordion Default runs with native renderer', async () => {
  await Default.run();

  expect(screen.getByTestId('svelte-accordion')).toBeInTheDocument();
  expect(screen.getByText('Section 1')).toBeInTheDocument();
});
