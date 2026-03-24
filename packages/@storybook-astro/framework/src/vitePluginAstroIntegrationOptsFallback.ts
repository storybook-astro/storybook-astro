import type { Plugin } from 'vite';

/**
 * Stub for `astro:react:opts` and `astro:preact:opts` virtual modules.
 *
 * These modules are exported by @astrojs/react and @astrojs/preact respectively.
 * They carry the `include`/`exclude` glob options passed to the integration and
 * are imported by each integration's server.js during SSR rendering.
 *
 * Normally the opts plugin is registered by the Astro integration inside a full
 * Astro Vite build. In Storybook's SSR context the integration hooks do not run,
 * so the virtual module is never registered and resolution fails.
 *
 * This fallback stubs both modules with `export default {}` (empty opts), which
 * is safe: the server renderers use the opts only for framework detection hints,
 * and Storybook's integration config (via the `include` globs in .storybook/main.js)
 * already handles routing correctly.
 */

const OPTS_STUB = `export default {};`;

const VIRTUAL_IDS = ['astro:react:opts', 'astro:preact:opts'];

export function vitePluginAstroIntegrationOptsFallback(): Plugin {
  const resolvedIds = new Map(VIRTUAL_IDS.map((id) => [id, '\0' + id]));
  const resolvedIdSet = new Set(resolvedIds.values());

  return {
    name: 'storybook-astro-integration-opts-fallback',
    // Must run before vite:resolve so the virtual module IDs are intercepted
    // before Vite tries to find them as Node package imports (and fails).
    enforce: 'pre',

    resolveId(id) {
      const resolved = resolvedIds.get(id);

      if (resolved) {
        return resolved;
      }
    },

    load(id) {
      if (resolvedIdSet.has(id)) {
        return { code: OPTS_STUB };
      }
    }
  };
}
