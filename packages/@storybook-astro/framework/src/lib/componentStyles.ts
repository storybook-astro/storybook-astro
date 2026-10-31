import { existsSync } from 'node:fs';
import { isCSSRequest, normalizePath, type EnvironmentModuleNode, type ViteDevServer } from 'vite';

// The sub-module Astro's Vite plugin creates for each `<style>` block, e.g.
// `Card.astro?astro&type=style&index=0&lang.css` (or `&lang.scss`, …).
const ASTRO_STYLE_MODULE = /\?astro&type=style&index=\d+&lang\.\w+$/;

// A stylesheet imported by a component a story renders or by a module it
// imports, such as `./card.css`, `./card.scss` or `./card.module.css`, as an
// Astro page ships them (issue #223). One with a query, such as `?url` or
// `?raw`, isn't applied as a stylesheet. That also skips a Vue or Svelte
// component's style blocks for now (issue #241). A plugin's virtual stylesheet
// (`\0virtual:*.css`, or UnoCSS's `/__uno.css`) isn't a file on disk, so Vite
// can't inline it.
const isImportedStylesheet = (id: string) =>
  isCSSRequest(id) && !id.includes('?') && existsSync(id);

export type ComponentStyles = {
  /**
   * The compiled CSS of each `<style>` block and imported stylesheet, in
   * cascade order. Each one ships as its own `<style>` element, as Astro's dev
   * server ships them, so a stylesheet's `@import`, `@layer` and `@charset`
   * rules mean what they mean there.
   */
  stylesheets: string[];
  /** What couldn't be styled: a component missing from the module graph, or a stylesheet that failed to load. */
  failures: Array<{ moduleId: string; error: unknown }>;
};

/**
 * Returns the scoped CSS Astro compiled for the given components and every
 * module they import, for the story render that loaded them (issue #189),
 * along with the stylesheets imported by those components and the modules
 * they import, as an Astro page ships them (issue #223).
 *
 * The story HTML comes from this same SSR server, so the compiled CSS carries
 * the same `data-astro-cid-*` scope as the markup, scoped the way the
 * installed compiler scopes it.
 *
 * `componentIds` must already be loaded through `viteServer`, so their imports
 * are in its module graph, and come in cascade order: a component's CSS comes
 * before the CSS of the ones after it. One failure doesn't drop the other
 * components' CSS: it's reported in `failures` for the caller to warn about
 * or fail on.
 */
export async function loadComponentStyles(
  viteServer: Pick<ViteDevServer, 'environments' | 'ssrLoadModule'>,
  componentIds: Iterable<string>
): Promise<ComponentStyles> {
  // The SSR environment's graph only: the client's holds the browser's
  // imports, and looking an id up there can fail for client-only reasons.
  const { moduleGraph } = viteServer.environments.ssr;
  const styleModuleIds = new Set<string>();
  const visited = new Set<EnvironmentModuleNode>();
  const failures: ComponentStyles['failures'] = [];

  const collect = (module: EnvironmentModuleNode) => {
    if (visited.has(module)) {
      return;
    }
    visited.add(module);

    if (module.id && (ASTRO_STYLE_MODULE.test(module.id) || isImportedStylesheet(module.id))) {
      styleModuleIds.add(module.id);
    }

    // Like Astro's own crawl, don't follow the imports of a stylesheet or of a
    // module with a query (`?url`, `?raw`, a style block). A stylesheet's
    // `@import`s are already inlined, and PostCSS plugins such as Tailwind
    // list every file they scan as its imports, which would pull in the
    // styles of components this story never rendered.
    if (module.id && (isCSSRequest(module.id) || module.id.includes('?'))) {
      return;
    }

    for (const imported of module.importedModules) {
      collect(imported);
    }
  };

  for (const componentId of componentIds) {
    try {
      const modules = await findComponentModules(moduleGraph, componentId);

      if (modules.length > 0) {
        modules.forEach(collect);
      } else if (existsSync(componentId)) {
        // A file on disk that the render loaded should be in the graph. A
        // component whose file isn't here (a precompiled package component,
        // say) has no style modules for this server to find.
        failures.push({
          moduleId: componentId,
          error: new Error('The component is not in the SSR module graph, so its styles were not found.')
        });
      }
    } catch (error) {
      failures.push({ moduleId: componentId, error });
    }
  }

  const styleModules = [...styleModuleIds];
  const results = await Promise.allSettled(
    styleModules.map(async (styleModuleId) => {
      // `inline` asks Vite's CSS plugin for the CSS text instead of a module
      // that injects it. In a style block's id it goes before `lang.*`, which
      // must stay last.
      // The walk already classified the id, so this doesn't check the disk
      // again: a file deleted since then fails to load and is reported.
      const inlineId = ASTRO_STYLE_MODULE.test(styleModuleId)
        ? styleModuleId.replace(/&lang\.(\w+)$/, '&inline&lang.$1')
        : `${styleModuleId}?inline`;
      const { default: css } = (await viteServer.ssrLoadModule(inlineId)) as { default: string };

      return css;
    })
  );

  const stylesheets = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value ? [result.value] : [];
    }

    failures.push({ moduleId: styleModules[index], error: result.reason });

    return [];
  });

  return { stylesheets, failures };
}

/**
 * Finds a component's own modules. Looks up by file first: a component imported
 * by a story file outside the project root is registered under a `/@fs/` URL,
 * not its plain path. The file's other modules are skipped: they include style
 * sub-modules Vite never prunes, so a deleted `<style>` block would still be
 * listed. The component module's current imports reach the live ones.
 */
async function findComponentModules(
  moduleGraph: ViteDevServer['environments']['ssr']['moduleGraph'],
  componentId: string
): Promise<EnvironmentModuleNode[]> {
  // Vite keys files by forward-slash path, also on Windows.
  const modulesForFile = moduleGraph.getModulesByFile(normalizePath(componentId)) ?? [];
  const componentModules = [...modulesForFile].filter((module) => !module.id?.includes('?'));

  if (componentModules.length > 0) {
    return componentModules;
  }

  const moduleForUrl = await moduleGraph.getModuleByUrl(componentId);

  return moduleForUrl ? [moduleForUrl] : [];
}
