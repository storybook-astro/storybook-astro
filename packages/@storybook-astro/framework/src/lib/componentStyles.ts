import { existsSync } from 'node:fs';
import { isCSSRequest, normalizePath, type EnvironmentModuleNode, type ViteDevServer } from 'vite';
import { compiledStylesheetsFor, isAppliedStylesheet } from './compiledStylesheets.ts';

// The sub-module Astro's Vite plugin creates for each `<style>` block, e.g.
// `Card.astro?astro&type=style&index=0&lang.css` (or `&lang.scss`, …).
const ASTRO_STYLE_MODULE = /\?astro&type=style&index=\d+&lang\.\w+$/;

export type ComponentStyles = {
  /**
   * The compiled CSS of each `<style>` block and stylesheet the rendered
   * components import, in cascade order. Each one ships as its own `<style>` element, as Astro's dev
   * server ships them, so a stylesheet's `@import`, `@layer` and `@charset`
   * rules mean what they mean there.
   */
  stylesheets: string[];
  /** What couldn't be styled: a component missing from the module graph, or a `<style>` block the server didn't compile. */
  failures: Array<{ moduleId: string; error: unknown }>;
};

/**
 * Returns the scoped CSS Astro compiled for the given components and every
 * module they import, for the story render that loaded them (issue #189),
 * along with the stylesheets imported by those components and the modules
 * they import, as an Astro page ships them (issue #223).
 *
 * The story HTML comes from this same SSR server, and the CSS is what that
 * server compiled while rendering it (`vitePluginCompiledStylesheets`), so it
 * carries the same `data-astro-cid-*` scope and CSS Module class names as the
 * markup, scoped the way the installed compiler scopes it.
 *
 * `componentIds` must already be loaded through `viteServer`, so their imports
 * are in its module graph, and come in cascade order: a component's CSS comes
 * before the CSS of the ones after it. One failure doesn't drop the other
 * components' CSS: it's reported in `failures` for the caller to warn about
 * or fail on.
 */
export async function loadComponentStyles(
  viteServer: Pick<ViteDevServer, 'environments' | 'config'>,
  componentIds: Iterable<string>
): Promise<ComponentStyles> {
  // The SSR environment's graph only: the client's holds the browser's
  // imports, and looking an id up there can fail for client-only reasons.
  const { moduleGraph } = viteServer.environments.ssr;
  const compiled = compiledStylesheetsFor(viteServer);

  if (!compiled) {
    throw new Error('This Vite server has no vitePluginCompiledStylesheets, so story styles cannot be read.');
  }

  const styleModuleIds = new Set<string>();
  const visited = new Set<EnvironmentModuleNode>();
  const failures: ComponentStyles['failures'] = [];

  const collect = (module: EnvironmentModuleNode) => {
    if (visited.has(module)) {
      return;
    }
    visited.add(module);

    // Every stylesheet the page applies, as an Astro page ships them: `<style>`
    // blocks, imported stylesheets (`./card.css`, Sass, CSS Modules, issue
    // #223), a Vue or Svelte component's style blocks (issue #241) and a
    // plugin's virtual stylesheet (issue #243).
    if (module.id && isAppliedStylesheet(module.id)) {
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

    // Nor a dynamic `import()` or lazy `import.meta.glob` target: whether one
    // is in the graph depends on what earlier renders loaded, so following it
    // would make a story's CSS depend on render order (issue #245).
    const dynamicImports = new Set(module.transformResult?.dynamicDeps ?? []);

    for (const imported of module.importedModules) {
      if (!dynamicImports.has(imported.url)) {
        collect(imported);
      }
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

  const stylesheets: string[] = [];

  for (const styleModuleId of styleModuleIds) {
    const css = compiled.get(styleModuleId);

    if (css) {
      stylesheets.push(css);
    } else if (css === undefined && ASTRO_STYLE_MODULE.test(styleModuleId)) {
      // The render loaded the component, which imports its style blocks, so
      // the server compiled them. One it didn't compile is reported. Any other
      // stylesheet it didn't compile wasn't loaded by this render.
      failures.push({
        moduleId: styleModuleId,
        error: new Error('The SSR server did not compile this <style> block, so its CSS was not found.')
      });
    }
  }

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
