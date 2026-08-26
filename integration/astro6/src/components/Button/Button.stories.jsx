import Button from '@storybook-astro/components/Button/astro/Button.astro';

// Everything in the props table below is extracted from Button.astro's
// frontmatter — this file deliberately declares no argTypes and no component
// description (docs/specs/docgen.md).
export default {
  title: 'Astro/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Default solid button at medium size.' } },
  },
  args: {
    slots: { default: 'Click me' },
  },
};

export const Outline = {
  parameters: {
    docs: { description: { story: 'Outline variant at large size.' } },
  },
  args: {
    variant: 'outline',
    size: 'lg',
    slots: { default: 'Read the docs' },
  },
};

export const AsLink = {
  parameters: {
    docs: {
      description: {
        story:
          'Rendered as an anchor. `href` only exists on the anchor constituent of the polymorphic union, so it appears in the table only because docgen merges both.',
      },
    },
  },
  args: {
    as: 'a',
    href: 'https://storybook-astro.org',
    variant: 'soft',
    slots: { default: 'Visit the site' },
  },
};

export const Disabled = {
  parameters: {
    docs: { description: { story: 'Disabled state, dimmed and non-interactive.' } },
  },
  args: {
    disabled: true,
    slots: { default: 'Unavailable' },
  },
};
