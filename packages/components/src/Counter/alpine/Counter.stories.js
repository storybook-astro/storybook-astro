import Counter from '@storybook-astro/components/Counter/alpine/Counter.astro';

export default {
  title: 'Alpine/Counter',
  component: Counter,
  parameters: {
    docs: {
      description: {
        component: 'A minimal counter using Alpine.js directives (`x-data`, `x-on:click`, `x-text`) in an Astro component. No props - starts at 1 and increments on click.',
      },
    },
  },
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Counter starting at 1.' } },
  },
};
