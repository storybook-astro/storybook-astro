import { composeStories } from 'storybook/preview-api';
import { setProjectAnnotations } from 'storybook-solidjs';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Accordion.stories.js';

const composedProjectAnnotations = setProjectAnnotations([
  // projectAnnotations
]);

const { Default } = composeStories(stories, composedProjectAnnotations);

test('Solid Accordion Default composes with native renderer', () => {
  expect(Default).toBeDefined();
  expect(Default.parameters?.renderer).toBe('solid');
});
