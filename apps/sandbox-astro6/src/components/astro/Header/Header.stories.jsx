import Header from './Header.astro';

export default {
  title: 'Astro/Header',
  component: Header,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A responsive site header with logo, navigation links, and a mobile hamburger menu. The active link is highlighted based on `currentPath`.',
      },
    },
  },
  argTypes: {
    logoText: {
      description: 'Logo text displayed in the top-left.',
      control: 'text',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: "'Storybook Astro'" },
      },
    },
    navItems: {
      description: 'Navigation links. Each item has a `label` and `href`.',
      control: 'object',
      table: {
        type: { summary: '{ label: string, href: string }[]' },
        defaultValue: { summary: 'About, Contribute, Sample Components, Storybook Demo' },
      },
    },
    currentPath: {
      description: 'Current URL path used to highlight the active nav link.',
      control: 'text',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'Astro.url.pathname' },
      },
    },
  },
};

export const Default = {
  parameters: {
    docs: { description: { story: 'Header with default navigation.' } },
  },
};

export const CustomNav = {
  parameters: {
    docs: { description: { story: 'Header with custom logo text and navigation. Dashboard link is active.' } },
  },
  args: {
    logoText: 'My Project',
    navItems: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Settings', href: '/settings' },
      { label: 'Help', href: '/help' },
    ],
    currentPath: '/dashboard',
  },
};

export const SingleLink = {
  parameters: {
    docs: { description: { story: 'Header with a single Home link.' } },
  },
  args: {
    navItems: [
      { label: 'Home', href: '/' },
    ],
    currentPath: '/',
  },
};
