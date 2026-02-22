import Counter from '@storybook-astro/components/Counter/vue/Counter.vue';

export default {
  parameters: {
    renderer: 'vue',
    docs: {
      description: {
        component: 'A simple counter using Vue\'s `ref` reactivity. No props — starts at 1 and increments on click.',
      },
    },
  },
  title: 'Vue/Counter',
  component: Counter,
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Counter starting at 1.' } },
  },
};
