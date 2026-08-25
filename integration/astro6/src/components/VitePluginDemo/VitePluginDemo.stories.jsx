import VitePluginDemo from './VitePluginDemo.astro';

export default {
  title: 'Astro/Vite Plugin Demo',
  component: VitePluginDemo,
  parameters: {
    docs: {
      description: {
        component:
          'Both the Astro component and its hydrated Vue island import a virtual module that only a project-level `vite.plugins` entry in `astro.config.mjs` can resolve. If any render pipeline is missing those plugins the story fails to build or render (issue #169).',
      },
    },
  },
};

export const Default = {};
