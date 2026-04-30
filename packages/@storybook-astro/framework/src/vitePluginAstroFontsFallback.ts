import type { Plugin } from 'vite';

const FONTS_RUNTIME_STUB = `
export const fontData = {};
export function createGetFontData(fontsMod) {
  return fontsMod?.fontDataByCssVariable ?? {};
}
export function experimental_getFontFileURL() {
  return '';
}
`;

const FONTS_INTERNAL_STUB = `
export const componentDataByCssVariable = new Map();
export const fontDataByCssVariable = {};
`;

/**
 * Provides fallback resolution for Astro's font-related virtual modules
 * and package import paths in Storybook's SSR Vite server.
 *
 * In Astro 6, the `astro:assets` virtual module depends on font-related
 * modules through virtual modules and a bare `astro/assets/fonts/runtime`
 * import. In the Storybook SSR context:
 *
 * 1. The fonts plugin's filter-based `resolveId` may not trigger for
 *    the virtual module IDs.
 * 2. A Vite transform rewrites the `astro:assets` module to import
 *    `createGetFontData` from `astro/assets/fonts/runtime` (without
 *    `.js`), which fails against Astro's package.json exports map.
 * 3. The `createGetFontData` function is injected by a runtime Vite
 *    transform that doesn't run in our SSR context.
 *
 * This plugin stubs all font module paths with no-op exports,
 * since Storybook doesn't need Astro's font system.
 *
 * Astro 6.2 adds a fourth path: `virtual:astro:assets/fonts/runtime/font-file-url-resolver`,
 * which provides the `runtimeFontFileUrlResolver` consumed by `runtime.ts` to implement
 * `experimental_getFontFileURL`. We stub it here so that if anything imports it outside
 * of our already-stubbed runtime virtual module, it resolves cleanly.
 */
export function vitePluginAstroFontsFallback(): Plugin {
  const VIRTUAL_ID = 'virtual:astro:assets/fonts/internal';
  const RUNTIME_VIRTUAL_ID = 'virtual:astro:assets/fonts/runtime';
  const RUNTIME_RESOLVER_VIRTUAL_ID = 'virtual:astro:assets/fonts/runtime/font-file-url-resolver';
  const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;
  const RESOLVED_RUNTIME_VIRTUAL_ID = '\0' + RUNTIME_VIRTUAL_ID;
  const RESOLVED_RUNTIME_RESOLVER_VIRTUAL_ID = '\0' + RUNTIME_RESOLVER_VIRTUAL_ID;
  const RESOLVED_FONTS_RUNTIME_ID = '\0storybook:astro-fonts-runtime';

  return {
    name: 'storybook-astro-fonts-fallback',
    // Must run before vite:resolve to intercept virtual modules
    // before Vite tries to resolve them as Node package imports
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
      if (id === RUNTIME_VIRTUAL_ID) {
        return RESOLVED_RUNTIME_VIRTUAL_ID;
      }
      if (id === RUNTIME_RESOLVER_VIRTUAL_ID) {
        return RESOLVED_RUNTIME_RESOLVER_VIRTUAL_ID;
      }
      // Intercept the bare package import (without .js) and the .js variant
      if (id === 'astro/assets/fonts/runtime' || id === 'astro/assets/fonts/runtime.js') {
        return RESOLVED_FONTS_RUNTIME_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        return { code: FONTS_INTERNAL_STUB };
      }
      if (id === RESOLVED_RUNTIME_VIRTUAL_ID || id === RESOLVED_FONTS_RUNTIME_ID) {
        return { code: FONTS_RUNTIME_STUB };
      }
      if (id === RESOLVED_RUNTIME_RESOLVER_VIRTUAL_ID) {
        return { code: `export const runtimeFontFileUrlResolver = { resolve() { return null; } };` };
      }
    }
  };
}
