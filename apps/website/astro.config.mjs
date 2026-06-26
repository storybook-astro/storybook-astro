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
      head: [
        {
          tag: 'script',
          attrs: {
            src: 'https://www.googletagmanager.com/gtag/js?id=G-ZSG21NBNEC',
            async: true,
          },
        },
        {
          tag: 'script',
          content: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-ZSG21NBNEC');
          `,
        },
      ],
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
            { label: 'Styling', slug: 'guides/styling' },
            { label: 'Images', slug: 'guides/images' },
            { label: 'Testing Stories', slug: 'guides/testing' },
            { label: 'Sanitization', slug: 'guides/sanitization' },
            { label: 'Troubleshooting', slug: 'guides/troubleshooting' },
            { label: 'Roadmap', slug: 'guides/roadmap' },
          ],
        },
        {
          label: 'How It Works',
          items: [
            { label: 'Overview', slug: 'how-it-works' },
            { label: 'Architecture', slug: 'how-it-works/architecture' },
            { label: 'Dev Mode Rendering', slug: 'how-it-works/dev-mode' },
            { label: 'Static Builds', slug: 'how-it-works/static-builds' },
            { label: 'Framework Integration', slug: 'how-it-works/framework-integration' },
            { label: 'Version Compatibility', slug: 'how-it-works/version-compatibility' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Configuration', slug: 'reference/configuration' },
            { label: 'Changelog', slug: 'reference/changelog' },
          ],
        },
      ],
    }),
  ],
});
