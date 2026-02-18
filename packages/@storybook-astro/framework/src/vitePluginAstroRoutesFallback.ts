import type { Plugin } from 'vite';

const ROUTES_STUB = `
export const routes = [];
`;

/**
 * Provides fallback resolution for Astro's routes virtual module
 * in Storybook's SSR Vite server.
 *
 * In Astro 6, the manifest and app entrypoints import from "virtual:astro:routes"
 * to get route data. In Storybook's context, there are no routes, so this plugin
 * stubs the virtual module with an empty routes array.
 */
export function vitePluginAstroRoutesFallback(): Plugin {
  const VIRTUAL_ID = 'virtual:astro:routes';
  const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

  return {
    name: 'storybook-astro-routes-fallback',
    // Must run before vite:resolve to intercept virtual modules
    // before Vite tries to resolve them as Node package imports
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        return { code: ROUTES_STUB };
      }
    }
  };
}
