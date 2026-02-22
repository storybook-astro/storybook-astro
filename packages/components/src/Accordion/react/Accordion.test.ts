import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import { screen } from '@testing-library/react';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Accordion.stories.js';

// setProjectAnnotations([projectAnnotations]);

const { Default } = composeStories(stories);

test('React Accordion Default renders with native React renderer', () => {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);

  try {
    flushSync(() => {
      root.render(createElement(Default));
    });

    expect(screen.getByTestId('react-accordion')).toBeInTheDocument();
    expect(screen.getByText('Section 1')).toBeInTheDocument();
  } finally {
    root.unmount();
    element.remove();
  }
});
