import Counter from './Counter.jsx';

export default {
  parameters: {
    renderer: 'preact',
    docs: {
      description: {
        component: 'A simple counter using Preact\'s `useState` hook. No props — starts at 1 and increments on click.',
      },
    },
  },
  title: 'Preact/Counter',
  component: Counter,
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Counter starting at 1.' } },
  },
};
