import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import { screen } from '@testing-library/dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Counter.stories.js';

// setProjectAnnotations([projectAnnotations]);

const { Default } = composeStories(stories);

test('React Counter Default renders with native React renderer', () => {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);

  try {
    flushSync(() => {
      root.render(createElement(Default));
    });

    expect(screen.getByTestId('react-counter')).toHaveTextContent('React counter: 1');
  } finally {
    root.unmount();
    element.remove();
  }
});
