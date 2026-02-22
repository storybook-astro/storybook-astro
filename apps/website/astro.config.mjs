// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
  integrations: [
    preact(),
    starlight({
      title: 'Storybook Astro',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/storybook-astro/storybook-astro' },
        { icon: 'external', label: 'Live Demo', href: 'https://demo.storybook-astro.org' },
      ],
      components: {
        ThemeProvider: '@storybook-astro/components/ThemeProvider/astro/ThemeProvider.astro',
        ThemeSelect: '@storybook-astro/components/ThemeProvider/astro/ThemeProvider.astro',
      },
      customCss: [
        '@fontsource/inter/400.css',
        '@fontsource/inter/600.css',
        '@fontsource/inter/700.css',
        './src/styles/starlight-overrides.css',
      ],
      disable404Route: true,
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Overview', slug: 'getting-started' },
            { label: 'Requirements', slug: 'getting-started/requirements' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Configuration', slug: 'getting-started/configuration' },
          ],
        },
        {
          label: 'Writing Stories',
          items: [
            { label: 'Story Basics', slug: 'writing-stories' },
            { label: 'Props', slug: 'writing-stories/props' },
            { label: 'Slots', slug: 'writing-stories/slots' },
            { label: 'Controls & ArgTypes', slug: 'writing-stories/controls' },
            { label: 'Framework Components', slug: 'writing-stories/framework-components' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Images', slug: 'guides/images' },
            { label: 'Testing Stories', slug: 'guides/testing' },
          ],
        },
        {
          label: 'How It Works',
          items: [
            { label: 'Architecture', slug: 'how-it-works/architecture' },
            { label: 'Dev Mode Rendering', slug: 'how-it-works/dev-mode' },
            { label: 'Static Builds', slug: 'how-it-works/static-builds' },
            { label: 'Framework Integration', slug: 'how-it-works/framework-integration' },
            { label: 'Astro 6 Compatibility', slug: 'how-it-works/astro6-compat' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Feature Support', slug: 'reference/feature-support' },
            { label: 'Configuration', slug: 'reference/configuration' },
          ],
        },
      ],
    }),
  ],
});
