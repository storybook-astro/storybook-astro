import Footer from './Footer.astro';

export default {
  title: 'Astro/Footer',
  component: Footer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A site footer with configurable links and license text. Responsive layout — links stack vertically on mobile and align horizontally with dot separators on desktop.',
      },
    },
  },
  argTypes: {
    links: {
      description: 'Footer links. Each item has a `label` and `href`.',
      control: 'object',
      table: {
        type: { summary: '{ label: string, href: string }[]' },
        defaultValue: { summary: 'Storybook feature request, framework docs, Container API' },
      },
    },
    licenseText: {
      description: 'License notice displayed below the links.',
      control: 'text',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: "'Licensed under MIT'" },
      },
    },
  },
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Footer with default links and license text.' } },
  },
};

export const CustomLinks = {
  parameters: {
    docs: { description: { story: 'Footer with custom GitHub and npm links.' } },
  },
  args: {
    links: [
      { label: 'GitHub', href: 'https://github.com' },
      { label: 'npm', href: 'https://npmjs.com' },
    ],
  },
};

export const DifferentLicense = {
  parameters: {
    docs: { description: { story: 'Footer with Apache 2.0 license text.' } },
  },
  args: {
    licenseText: 'Licensed under Apache 2.0',
  },
};
