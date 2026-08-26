import Header from '@storybook-astro/components/Header/astro/Header.astro';

export default {
  title: 'Astro/Header',
  component: Header,
  parameters: {
    layout: 'fullscreen',
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
