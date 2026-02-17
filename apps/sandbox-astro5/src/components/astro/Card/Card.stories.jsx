import Card from './Card.astro';

export default {
  title: 'Astro/Card',
  component: Card,
  args: {},
};

export const Default = {};

export const Highlight = {
  args: {
    title: 'Highlighted Card',
    content: 'This card has the highlight state enabled.',
    highlight: true,
  },
};
