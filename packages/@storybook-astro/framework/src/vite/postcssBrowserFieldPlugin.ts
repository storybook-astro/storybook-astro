import type { Plugin } from 'vite';

const EMPTY_MODULE_ID = '\0storybook-astro:postcss-empty-builtin';

/**
 * The render runtime sanitizes HTML with `sanitize-html`, which parses style
 * attributes with postcss. postcss reads `path`, `url` and `fs` only for
 * source maps and input files, and its `browser` field maps them to `false`
 * for runtimes without Node. Vite only applies that field to client builds,
 * so on Cloudflare Workers the bundle kept `require('path')`, which an ES
 * module there can't call. This applies postcss's own mapping everywhere.
 */
export function postcssBrowserFieldPlugin(): Plugin {
  return {
    name: 'storybook-astro:postcss-browser-field',
    enforce: 'pre',
    resolveId(id, importer) {
      if (['path', 'url', 'fs'].includes(id) && importer?.replace(/\\/g, '/').includes('/postcss/lib/')) {
        return EMPTY_MODULE_ID;
      }

      return null;
    },
    load(id) {
      return id === EMPTY_MODULE_ID ? 'export default {};' : null;
    }
  };
}
