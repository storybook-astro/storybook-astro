import Counter from '@storybook-astro/components/Counter/react/Counter.jsx';

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
