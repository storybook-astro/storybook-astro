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

// Same dashed frame + label as the Astro decorator stories' Wrapper.astro, so
// the decorator is visually obvious in the canvas across all three renderers.
const decoratorFrameStyle = {
  border: '2px dashed #6366f1',
  borderRadius: '8px',
  padding: '1rem',
};

const decoratorLabelStyle = {
  margin: '0 0 0.75rem',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6366f1',
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
        {
          className: 'decorator-story-level',
          'data-testid': 'story-decorator',
          style: decoratorFrameStyle,
        },
        createElement('p', { style: decoratorLabelStyle }, 'Story-level decorator'),
        Story()
      ),
  ],
};
