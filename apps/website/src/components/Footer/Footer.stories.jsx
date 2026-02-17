import Footer from './Footer.astro';

export default {
  title: 'Astro/Footer',
  component: Footer,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    licenseText: { control: 'text' },
    links: { control: 'object' },
  },
};

export const Default = {};

export const CustomLinks = {
  args: {
    links: [
      { label: 'GitHub', href: 'https://github.com' },
      { label: 'npm', href: 'https://npmjs.com' },
    ],
  },
};

export const DifferentLicense = {
  args: {
    licenseText: 'Licensed under Apache 2.0',
  },
};
