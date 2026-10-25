import { composeStories, setProjectAnnotations } from 'storybook/preview-api';
import * as solidAnnotations from 'storybook-solidjs-vite/renderer/solid-legacy';
import { test, expect } from 'vitest';
import * as stories from './Counter.stories.js';

const composedProjectAnnotations = setProjectAnnotations([solidAnnotations]);

const { Default } = composeStories(stories, composedProjectAnnotations);

test('Solid Counter Default composes with native renderer', () => {
  expect(Default).toBeDefined();
  expect(Default.parameters?.renderer).toBe('solid');
});
