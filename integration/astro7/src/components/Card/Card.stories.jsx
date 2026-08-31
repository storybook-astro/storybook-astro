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

// Exercises the Code Panel surface (docs/specs/code-panel-source.md): the same
// generated snippet feeds both "Show code" and the panel.
export const CodePanel = {
  parameters: {
    docs: {
      codePanel: true,
      description: { story: 'Shows the generated Astro snippet in the Code Panel.' },
    },
  },
  args: {
    title: 'Code panel card',
    content: 'The panel shows Astro template usage, not this story file.',
  },
};

// A user-supplied snippet must always win over the generated one.
export const CustomSource = {
  parameters: {
    docs: {
      source: { code: '<Card title="Handwritten" />' },
      description: { story: 'A manual `docs.source.code` overrides the generated snippet.' },
    },
  },
  args: {
    title: 'Overridden',
    content: 'The Show code block shows the handwritten snippet instead.',
  },
};
