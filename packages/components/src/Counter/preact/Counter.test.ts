import { composeStories } from 'storybook/preview-api';
import { setProjectAnnotations } from '@storybook/preact';
import { screen } from '@testing-library/dom';
import { h, render } from 'preact';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Counter.stories.js';

const composedProjectAnnotations = setProjectAnnotations([
  // projectAnnotations
]);

const { Default } = composeStories(stories, composedProjectAnnotations);

test('Preact Counter Default renders with native renderer composition', () => {
  const element = document.createElement('div');

  document.body.append(element);

  try {
    render(h(Default, {}), element);

    expect(screen.getByTestId('preact-counter')).toHaveTextContent('Preact counter: 1');
  } finally {
    render(null, element);
    element.remove();
  }
});
