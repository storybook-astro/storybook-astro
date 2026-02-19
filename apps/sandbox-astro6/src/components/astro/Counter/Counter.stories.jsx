import Counter from './Counter.astro';

export default {
  title: 'Astro/Counter',
  component: Counter,
  parameters: {
    docs: {
      description: {
        component: 'A minimal increment counter using vanilla JavaScript. No props — starts at 1 and increments on click. Uses an inline `<script>` tag for interactivity.',
      },
    },
  },
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Counter starting at 1.' } },
  },
};
