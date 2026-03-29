import type { Plugin } from 'vite';

const OPTS_STUB = 'export default {}';

const VIRTUAL_IDS = ['astro:react:opts', 'astro:preact:opts'];

export function vitePluginAstroIntegrationOptsFallback(): Plugin {
  const resolvedIds = new Map(VIRTUAL_IDS.map((id) => [id, `\0${id}`]));
  const resolvedIdSet = new Set(resolvedIds.values());

  return {
    name: 'storybook-astro-integration-opts-fallback',
    enforce: 'pre',

    resolveId(id) {
      return resolvedIds.get(id);
    },

    load(id) {
      if (resolvedIdSet.has(id)) {
        return { code: OPTS_STUB };
      }
    }
  };
}
