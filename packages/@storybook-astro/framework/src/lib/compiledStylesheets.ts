import { isCSSRequest, type Plugin, type ResolvedConfig } from 'vite';

const PLUGIN_NAME = 'storybook-astro:compiled-stylesheets';

// A stylesheet loaded with one of these queries isn't applied to the page:
// `?raw` and `?url` import its text or its URL, and `?inline` its CSS as a
// string.
const NOT_APPLIED_QUERY = /[?&](?:raw|url|inline)(?:&|=|$)/;

/** Whether a module id is a stylesheet Vite applies to the page, like Astro's `isBuildableCSSRequest`. */
export const isAppliedStylesheet = (id: string) => isCSSRequest(id) && !NOT_APPLIED_QUERY.test(id);

/**
 * Records the CSS Vite compiled for each stylesheet the SSR environment loads,
 * as Astro 7's dev server does (`astroDevCssContentCachePlugin`), so a story
 * ships the same CSS its markup was rendered with (issue #242). Loading a
 * stylesheet again with `?inline` would compile a second copy under another
 * module id, and any transform that depends on the id, such as CSS Module
 * class naming, could then disagree with the markup.
 *
 * Add it after every other normal-order plugin: it has to see the CSS once
 * integrations and PostCSS have finished with it, and before Vite's
 * `vite:css-post` turns it into a JS module. Don't give it `enforce: 'post'`:
 * Vite runs post plugins after `vite:css-post`, when the stylesheet is already
 * a JS module.
 */
export function vitePluginCompiledStylesheets(): Plugin {
  // The compiled CSS of each stylesheet, by module id. `api` is how Vite
  // plugins share state: the server's resolved config keeps this object.
  const compiled = new Map<string, string>();

  return {
    name: PLUGIN_NAME,
    api: { compiled },

    transform(code, id) {
      if (this.environment?.name === 'ssr' && isAppliedStylesheet(id)) {
        // Vite strips a UTF-8 byte order mark later, in `vite:css-post`. Left
        // in, it would be part of the first selector and break that rule.
        compiled.set(id, code.replace(/^\uFEFF/, ''));
      }
    }
  };
}

/** The compiled CSS the server's `vitePluginCompiledStylesheets` recorded. */
export function compiledStylesheetsFor(server: {
  config: Pick<ResolvedConfig, 'plugins'>;
}): ReadonlyMap<string, string> | undefined {
  const plugin = server.config.plugins.find((candidate) => candidate.name === PLUGIN_NAME);

  return (plugin?.api as { compiled?: Map<string, string> } | undefined)?.compiled;
}
