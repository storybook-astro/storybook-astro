import Footer from '@storybook-astro/components/Footer/astro/Footer.astro';

export default {
  title: 'Astro/Footer',
  component: Footer,
  parameters: {
    layout: 'fullscreen',
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
