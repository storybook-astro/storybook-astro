import CodeTabs from '@storybook-astro/components/CodeTabs/astro/CodeTabs.astro';

export default {
  title: 'Astro/Code Tabs',
  component: CodeTabs,
  args: {
    framework: 'react',
  },
};

export const Default = {};

export const ReactHydrated = {
  name: 'React (client:load)',
  args: { framework: 'react' },
};

export const SolidHydrated = {
  name: 'Solid (client:load)',
  args: { framework: 'solid' },
};

export const PreactHydrated = {
  name: 'Preact (client:load)',
  args: { framework: 'preact' },
};

export const SvelteHydrated = {
  name: 'Svelte (client:load)',
  args: { framework: 'svelte' },
};

export const VueHydrated = {
  name: 'Vue (client:load)',
  args: { framework: 'vue' },
};

export const AlpineRuntime = {
  name: 'Alpine',
  args: { framework: 'alpine' },
};
