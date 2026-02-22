import { composeStories } from 'storybook/preview-api';
import { setProjectAnnotations } from '@storybook/preact';
import { screen } from '@testing-library/dom';
import { h, render } from 'preact';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Accordion.stories.js';

const composedProjectAnnotations = setProjectAnnotations([
  // projectAnnotations
]);

const { Default } = composeStories(stories, composedProjectAnnotations);

test('Preact Accordion Default renders with native renderer composition', () => {
  const element = document.createElement('div');
  document.body.append(element);

  try {
    render(h(Default, {}), element);

    expect(screen.getByTestId('preact-accordion')).toBeInTheDocument();
    expect(screen.getByText('Section 1')).toBeInTheDocument();
  } finally {
    render(null, element);
    element.remove();
  }
});
