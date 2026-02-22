import Card from '@storybook-astro/components/astro/Card/Card.astro';

export default {
  title: 'Astro/Card',
  component: Card,
  parameters: {
    docs: {
      description: {
        component: 'A simple content card with optional highlight styling. Supports a `main` named slot for additional content below the body text.',
      },
    },
  },
  argTypes: {
    title: {
      description: 'Card heading text.',
      control: 'text',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: "'Default title'" },
      },
    },
    content: {
      description: 'Card body text.',
      control: 'text',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: "'Default content'" },
      },
    },
    highlight: {
      description: 'Applies a highlighted visual style with a yellow background and border.',
      control: 'boolean',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
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
