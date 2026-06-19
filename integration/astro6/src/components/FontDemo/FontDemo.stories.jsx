import FontDemo from './FontDemo.astro';

export default {
  title: 'Astro/FontDemo',
  component: FontDemo,
  parameters: {
    docs: {
      description: {
        component:
          'Verifies the Astro 6 Font Provider integration. Renders text styled with `var(--font-inter)`, sourced from a Google-provided Inter family declared in `astro.config.mjs` (auto-loaded by Storybook — no mirror into `.storybook/main.js` required).'
      }
    }
  }
};

export const Default = {
  parameters: {
    docs: {
      description: {
        story:
          'If the font provider integration is working, both lines render in Inter (sans-serif) rather than the browser default.'
      }
    }
  }
};
