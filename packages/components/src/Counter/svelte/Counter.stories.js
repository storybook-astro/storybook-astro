import Counter from './Counter.svelte';

export default {
  parameters: {
    renderer: 'svelte',
    docs: {
      description: {
        component: 'A simple counter using Svelte\'s `$state` rune. No props - starts at 1 and increments on click.',
      },
    },
  },
  title: 'Svelte/Counter',
  component: Counter,
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Counter starting at 1.' } },
  },
};
