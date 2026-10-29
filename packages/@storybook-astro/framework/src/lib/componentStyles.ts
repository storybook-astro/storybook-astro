import { existsSync } from 'node:fs';
import type { ModuleNode, ViteDevServer } from 'vite';

// The sub-module Astro's Vite plugin creates for each `<style>` block, e.g.
// `Card.astro?astro&type=style&index=0&lang.css` (or `&lang.scss`, …).
const ASTRO_STYLE_MODULE = /\?astro&type=style&index=\d+&lang\.\w+$/;

export type ComponentStyles = {
  /**
   * The compiled CSS of each `<style>` block, in cascade order. Each one ships
   * as its own `<style>` element, as Astro's dev server ships them, so a
   * block's `@import`, `@layer` and `@charset` rules mean what they mean there.
   */
  stylesheets: string[];
  /** What couldn't be styled: a component missing from the module graph, or a block that failed to load. */
  failures: Array<{ moduleId: string; error: unknown }>;
};

/**
 * Returns the scoped CSS Astro compiled for the given components and every
 * module they import, for the story render that loaded them (issue #189).
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
  viteServer: Pick<ViteDevServer, 'moduleGraph' | 'ssrLoadModule'>,
  componentIds: Iterable<string>
): Promise<ComponentStyles> {
  const styleModuleIds = new Set<string>();
  const visited = new Set<ModuleNode>();
  const failures: ComponentStyles['failures'] = [];

  const collect = (module: ModuleNode) => {
    if (visited.has(module)) {
      return;
    }
    visited.add(module);

    if (module.id && ASTRO_STYLE_MODULE.test(module.id)) {
      styleModuleIds.add(module.id);
    }

    for (const imported of module.importedModules) {
      collect(imported);
    }
  };

  for (const componentId of componentIds) {
    try {
      const modules = await findComponentModules(viteServer, componentId);

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
      // that injects it. It goes before `lang.*`, which must stay last.
      const inlineId = styleModuleId.replace(/&lang\.(\w+)$/, '&inline&lang.$1');
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
  viteServer: Pick<ViteDevServer, 'moduleGraph'>,
  componentId: string
): Promise<ModuleNode[]> {
  const modulesForFile = viteServer.moduleGraph.getModulesByFile(componentId) ?? [];
  const componentModules = [...modulesForFile].filter((module) => !module.id?.includes('?'));

  if (componentModules.length > 0) {
    return componentModules;
  }

  const moduleForUrl = await viteServer.moduleGraph.getModuleByUrl(componentId, true);

  return moduleForUrl ? [moduleForUrl] : [];
}
