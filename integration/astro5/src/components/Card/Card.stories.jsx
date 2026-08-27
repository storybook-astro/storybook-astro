import Card from '@storybook-astro/components/Card/astro/Card.astro';

export default {
  title: 'Astro/Card',
  component: Card,
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Card with default prop values.' } },
  },
};

export const Highlight = {
  parameters: {
    docs: { description: { story: 'Card with the highlight state enabled.' } },
  },
  args: {
    title: 'Highlighted Card',
    content: 'This card has the highlight state enabled.',
    highlight: true,
  },
};
