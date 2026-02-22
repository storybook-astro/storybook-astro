import Counter from '@storybook-astro/components/solid/Counter/Counter.tsx';

export default {
  parameters: {
    renderer: 'solid',
    docs: {
      description: {
        component: 'A simple counter using Solid\'s `createSignal`. No props — starts at 1 and increments on click.',
      },
    },
  },
  title: 'Solid/Counter',
  component: Counter,
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Counter starting at 1.' } },
  },
};
