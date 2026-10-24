import type { Plugin } from 'vite';

/**
 * Turns off the client dependency optimizer of the framework's internal SSR
 * Vite servers (dev's `createViteServer` and the build's
 * `createStorySsrViteServer`).
 *
 * Those servers only render through `ssrLoadModule`; no browser loads modules
 * from them. Left on, the client optimizer scans every component in the project
 * with Vite's own `.astro` handling, which chokes on frontmatter JSDoc ("Failed
 * to run dependency scan"), and then pre-bundles the client deps Astro's
 * integrations list, where Astro's dev-toolbar plugin throws (issue #184).
 *
 * This has to happen in `configResolved`: integrations add their
 * `optimizeDeps.include` entries in their own `config` hooks, after any inline
 * config. `noDiscovery` with an empty `include` is how Vite 6–8 spell "off".
 */
export function vitePluginNoClientDepOptimizer(): Plugin {
  return {
    name: 'storybook-astro:no-client-dep-optimizer',
    configResolved(config) {
      for (const optimizeDeps of [config.optimizeDeps, config.environments?.client?.optimizeDeps]) {
        if (optimizeDeps) {
          optimizeDeps.noDiscovery = true;
          optimizeDeps.include = [];
        }
      }
    }
  };
}
