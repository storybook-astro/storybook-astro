import type { Plugin } from 'vite';

const VUE_APP_STUB = `
export const setup = () => {};
`;

// Different versions of @astrojs/vue use different virtual module names
const VIRTUAL_IDS = ['virtual:astro:vue-app', 'virtual:@astrojs/vue/app'];

/**
 * Provides fallback resolution for @astrojs/vue's virtual module
 * in Storybook's SSR Vite server.
 *
 * @astrojs/vue's server.js imports a virtual module to get a setup function
 * for configuring the Vue app instance. The virtual module name varies by version:
 * - v6.0.0-beta.1: "virtual:astro:vue-app"
 * - Later versions: "virtual:@astrojs/vue/app"
 *
 * The Vite plugin that normally creates this virtual module may not run in
 * Storybook's SSR context, so this plugin stubs it with a no-op setup function
 * (the default behavior when no appEntrypoint is configured).
 */
export function vitePluginAstroVueFallback(): Plugin {
  const resolvedIds = new Map(VIRTUAL_IDS.map((id) => [id, '\0' + id]));
  const resolvedIdSet = new Set(resolvedIds.values());

  return {
    name: 'storybook-astro-vue-fallback',
    // Must run before vite:resolve to intercept virtual modules
    // before Vite tries to resolve them as Node package imports
    enforce: 'pre',

    resolveId(id) {
      const resolved = resolvedIds.get(id);
      if (resolved) {
        return resolved;
      }
    },

    load(id) {
      if (resolvedIdSet.has(id)) {
        return { code: VUE_APP_STUB };
      }
    }
  };
}
