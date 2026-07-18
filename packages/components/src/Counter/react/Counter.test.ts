import { composeStories } from '@storybook/react-vite';
import { screen, within } from '@testing-library/dom';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { test, expect } from 'vitest';
// import * as projectAnnotations from '../../../../.storybook/preview';
import * as stories from './Counter.stories.js';

// setProjectAnnotations([projectAnnotations]);

const { Default, WithDecorator } = composeStories(stories);

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

// Issue #40 (Step 1): a story-level decorator, written in React's native
// format, must wrap the rendered output through the delegated React renderer.
test('React Counter WithDecorator is wrapped by its story-level decorator', () => {
  const element = document.createElement('div');

  document.body.append(element);
  const root = createRoot(element);

  try {
    flushSync(() => {
      root.render(createElement(WithDecorator));
    });

    const wrapper = screen.getByTestId('story-decorator');

    expect(wrapper).toHaveClass('decorator-story-level');
    expect(within(wrapper).getByTestId('react-counter')).toHaveTextContent('React counter: 1');
  } finally {
    root.unmount();
    element.remove();
  }
});
