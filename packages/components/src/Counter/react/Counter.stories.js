import { createElement } from 'react';
import Counter from './Counter.jsx';

export default {
  parameters: {
    renderer: 'react',
    docs: {
      description: {
        component: 'A simple counter using React\'s `useState` hook. No props — starts at 1 and increments on click.',
      },
    },
  },
  title: 'React/Counter',
  component: Counter,
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Counter starting at 1.' } },
  },
};

// Regression coverage for issue #40: a story-level decorator written in React's
// native JSX-free format (`createElement`, since this is a plain .js file) must
// still wrap the rendered output when the story is delegated to React's own
// renderer — see docs/DECORATOR_SUPPORT.md, Step 1.
export const WithDecorator = {
  parameters: {
    docs: { description: { story: 'Counter wrapped in a story-level decorator.' } },
  },
  decorators: [
    (Story) =>
      createElement(
        'div',
        { className: 'decorator-story-level', 'data-testid': 'story-decorator' },
        Story()
      ),
  ],
};
