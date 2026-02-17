import Header from './Header.astro';

export default {
  title: 'Astro/Header',
  component: Header,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    logoText: { control: 'text' },
    currentPath: { control: 'text' },
    navItems: { control: 'object' },
  },
};

export const Default = {};

export const CustomNav = {
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
  args: {
    navItems: [
      { label: 'Home', href: '/' },
    ],
    currentPath: '/',
  },
};
