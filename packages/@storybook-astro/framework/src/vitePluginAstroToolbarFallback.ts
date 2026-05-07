import type { Plugin } from 'vite';

const TOOLBAR_INTERNAL_STUB = `
export const loadDevToolbarApps = async () => [];
`;

/**
 * Provides a fallback stub for Astro's dev toolbar virtual module.
 *
 * Astro's `astro/dist/runtime/client/dev-toolbar/entrypoint.js` imports
 * from `astro:toolbar:internal`, a virtual module normally provided by
 * Astro's own `vite-plugin-dev-toolbar` Vite plugin. In the Storybook
 * context that plugin is not active, causing esbuild to fail during
 * dependency optimisation when it encounters the unresolvable import.
 *
 * Storybook doesn't use Astro's dev toolbar, so a no-op stub is safe.
 */
export function vitePluginAstroToolbarFallback(): Plugin {
  const VIRTUAL_ID = 'astro:toolbar:internal';
  const RESOLVED_ID = '\0' + VIRTUAL_ID;

  return {
    name: 'storybook-astro-toolbar-fallback',
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_ID) {
        return { code: TOOLBAR_INTERNAL_STUB };
      }
    }
  };
}
