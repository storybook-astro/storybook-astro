import CodeTabs from '@storybook-astro/components/astro/CodeTabs/CodeTabs.astro';

export default {
  title: 'Astro/Code Tabs',
  component: CodeTabs,
  args: {
    framework: 'react',
  },
  parameters: {
    docs: {
      description: {
        component: 'Code snippet tabs rendered by Astro, implemented by framework components. React/Solid/Preact/Svelte/Vue are hydrated with `client:load`; Alpine uses runtime directives.',
      },
    },
  },
  argTypes: {
    framework: {
      description: 'Client framework implementation mounted under Astro.',
      control: { type: 'select' },
      options: ['react', 'solid', 'preact', 'svelte', 'vue', 'alpine'],
      table: {
        type: { summary: "'react' | 'solid' | 'preact' | 'svelte' | 'vue' | 'alpine'" },
        defaultValue: { summary: 'react' },
      },
    },
  },
};

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
  name: 'Alpine (runtime directives)',
  args: { framework: 'alpine' },
};
