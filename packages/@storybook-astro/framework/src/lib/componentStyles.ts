import { existsSync } from 'node:fs';
import { isCSSRequest, normalizePath, type EnvironmentModuleNode, type ViteDevServer } from 'vite';
import { compiledStylesheetsFor, isAppliedStylesheet } from './compiledStylesheets.ts';

// The sub-module Astro's Vite plugin creates for each `<style>` block, e.g.
// `Card.astro?astro&type=style&index=0&lang.css` (or `&lang.scss`, …).
const ASTRO_STYLE_MODULE = /\?astro&type=style&index=\d+&lang\.\w+$/;

// Astro refreshes its server island map by clearing this module's transform
// result, so the module runner's next import compiles it again. Compiling it
// here would refill it and the runner would keep its stale map. Astro's own
// `ensureModulesLoaded` skips it too. It contains no CSS.
const SERVER_ISLAND_MANIFEST = '\0virtual:astro:server-island-manifest';

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
  viteServer: Pick<ViteDevServer, 'environments' | 'config' | 'ssrLoadModule'>,
  componentIds: Iterable<string>
): Promise<ComponentStyles> {
  // The SSR environment's graph only: the client's holds the browser's
  // imports, and looking an id up there can fail for client-only reasons.
  const ssr = viteServer.environments.ssr;
  const { moduleGraph } = ssr;
  const compiled = compiledStylesheetsFor(viteServer);

  if (!compiled) {
    throw new Error('This Vite server has no vitePluginCompiledStylesheets, so story styles cannot be read.');
  }

  const styleModules = new Map<string, EnvironmentModuleNode>();
  const visited = new Set<EnvironmentModuleNode>();
  // Imports this walk failed to compile, so each one is compiled and reported once.
  const failedToCompile = new Set<EnvironmentModuleNode>();
  const failures: ComponentStyles['failures'] = [];

  // A dynamic `import()` or `import.meta.glob` target is only compiled once
  // something calls it, so without this, whether its CSS is known would
  // depend on what earlier renders loaded (issue #245). Compile every import
  // the server hasn't, as Astro 7's dev server does (`ensureModulesLoaded`),
  // so its imports and their CSS are in the graph. That only transforms it:
  // it runs nothing, so a glob match that imports a browser-only library
  // doesn't fail or log here (issue #277). Like Astro dev, every component a
  // glob matches ships its CSS, not only the ones the story rendered.
  const compileImport = async (module: EnvironmentModuleNode) => {
    const id = module.id;

    if (!id || module.transformResult || failedToCompile.has(module)) {
      return;
    }

    if (isAppliedStylesheet(id)) {
      if (compiled.has(id)) {
        // The server compiled this stylesheet before, so the module runner
        // may hold its exports: a CSS Module's class names, which a
        // component the runner evaluated renders with. Vite clears a
        // module's transform result when its file changes, and a
        // transform outside the runner would refill it, so the runner's
        // next import would keep its old exports while the new CSS
        // shipped. Running a stylesheet runs no project code, so load it
        // through the runner, which records the new CSS too.
        await viteServer.ssrLoadModule(module.url);
      } else {
        await ssr.transformRequest(module.url);
      }

      return;
    }

    // Leave a module loaded with a query (`?raw`, `?url`, a framework's
    // script sub-module) alone: it isn't a component, and the walk doesn't
    // follow its imports.
    if (id.includes('?') || id === SERVER_ISLAND_MANIFEST) {
      return;
    }

    // Compiling a module the runner has evaluated would leave the runner on
    // its old exports the same way, and running it is what this pass avoids.
    // The runner only evaluates a module once it has compiled, and Vite
    // clears the transform result only when it invalidates the module (an
    // edit, or `invalidateAll` on a mocked render), so a module without one
    // that Vite never invalidated has never been evaluated. One Vite
    // invalidated may have been, so it isn't compiled here: its CSS comes
    // from the imports Vite recorded when it last compiled.
    if (module.lastInvalidationTimestamp === 0 && module.lastHMRTimestamp === 0) {
      await ssr.transformRequest(module.url);
    }
  };

  const collect = async (module: EnvironmentModuleNode) => {
    if (visited.has(module)) {
      return;
    }
    visited.add(module);

    // Every stylesheet the page applies, as an Astro page ships them: `<style>`
    // blocks, imported stylesheets (`./card.css`, Sass, CSS Modules, issue
    // #223), a Vue or Svelte component's style blocks (issue #241) and a
    // plugin's virtual stylesheet (issue #243).
    if (module.id && isAppliedStylesheet(module.id)) {
      styleModules.set(module.id, module);
    }

    // Like Astro's own crawl, don't follow the imports of a stylesheet or of a
    // module with a query (`?url`, `?raw`, a style block). A stylesheet's
    // `@import`s are already inlined, and PostCSS plugins such as Tailwind
    // list every file they scan as its imports, which would pull in the
    // styles of components this story never rendered.
    if (module.id && (isCSSRequest(module.id) || module.id.includes('?'))) {
      return;
    }

    // A module that failed to run fails the render that runs it, as in
    // Astro dev. Its imports may never have compiled, so don't walk it and
    // report their style blocks.
    if (module.ssrError) {
      return;
    }

    // Compile the imports together, then walk them in import order, so the
    // cascade order doesn't depend on which compile finished first.
    const imports = [...module.importedModules];
    const results = await Promise.allSettled(imports.map(compileImport));

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        return;
      }

      const imported = imports[index];

      failedToCompile.add(imported);

      // A stylesheet that doesn't compile (a Sass error, say) is reported,
      // so a static build fails on it, and the last CSS that compiled still
      // ships, as Astro dev keeps it. A component that doesn't compile fails
      // the render that calls it, and the story may not.
      if (imported.id && isAppliedStylesheet(imported.id)) {
        failures.push({ moduleId: imported.id, error: result.reason });
      }
    });

    for (const imported of imports) {
      await collect(imported);
    }
  };

  for (const componentId of componentIds) {
    try {
      const modules = await findComponentModules(moduleGraph, componentId);

      if (modules.length > 0) {
        for (const module of modules) {
          await collect(module);
        }
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

  for (const [styleModuleId, styleModule] of styleModules) {
    const css = compiled.get(styleModuleId);

    if (css) {
      stylesheets.push(css);
    } else if (
      css === undefined &&
      ASTRO_STYLE_MODULE.test(styleModuleId) &&
      !failedToCompile.has(styleModule)
    ) {
      // The render loaded the component, which imports its style blocks, so
      // the server compiled them. One it didn't compile is reported. A
      // stylesheet the walk reaches that the server never compiled is one no
      // render loaded with a static import, so it has no CSS to ship.
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
