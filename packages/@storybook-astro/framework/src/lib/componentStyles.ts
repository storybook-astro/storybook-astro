import type { ModuleNode, ViteDevServer } from 'vite';

// The sub-module Astro's Vite plugin creates for each `<style>` block, e.g.
// `Card.astro?astro&type=style&index=0&lang.css` (or `&lang.scss`, …).
const ASTRO_STYLE_MODULE = /\?astro&type=style&index=\d+&lang\.\w+$/;

/**
 * Returns the scoped CSS Astro compiled for the given components and every
 * module they import, for the story render that loaded them (issue #189).
 *
 * The story HTML comes from this same SSR server, so the compiled CSS carries
 * the same `data-astro-cid-*` scope as the markup and matches what a real Astro
 * page ships: nested selectors are scoped the way the installed compiler scopes
 * them.
 *
 * `componentIds` must already be loaded through `viteServer`, so their imports
 * are in its module graph.
 */
export async function loadComponentStyles(
  viteServer: Pick<ViteDevServer, 'moduleGraph' | 'ssrLoadModule'>,
  componentIds: Iterable<string>
): Promise<string> {
  const styleModuleIds = new Set<string>();
  const visited = new Set<ModuleNode>();

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
    // Look up by file first: a component imported by a story file outside the
    // project root is registered under a `/@fs/` URL, not its plain path.
    // The file's other modules are skipped: they include style sub-modules
    // Vite never prunes, so a deleted `<style>` block would still be listed.
    // The component module's current imports reach the live ones.
    const componentModules = [...(viteServer.moduleGraph.getModulesByFile(componentId) ?? [])].filter(
      (module) => !module.id?.includes('?')
    );
    const modules = componentModules.length
      ? componentModules
      : [await viteServer.moduleGraph.getModuleByUrl(componentId, true)];

    modules.forEach((module) => module && collect(module));
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

  // One broken block (a Sass error, say) shouldn't unstyle the whole story.
  const cssBlocks = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value ? [result.value] : [];
    }

    console.warn(`[storybook-astro] Could not load ${styleModules[index]}:`, result.reason);

    return [];
  });

  return joinStylesheets(cssBlocks);
}

// An `@import` statement, which Vite leaves at the top of a block when it can't
// inline it (a remote URL, for example).
const LEADING_IMPORT = /^(?:\s|\/\*[\s\S]*?\*\/)*@import\s+(?:"[^"]*"|'[^']*'|url\([^)]*\))[^;]*;/;

/**
 * Joins style blocks into one stylesheet. Browsers ignore an `@import` that
 * comes after other rules, so each block's leading imports move to the top.
 */
function joinStylesheets(cssBlocks: string[]) {
  const imports: string[] = [];
  const rules = cssBlocks.map((css) => {
    let rest = css;
    let match: RegExpExecArray | null;

    while ((match = LEADING_IMPORT.exec(rest))) {
      imports.push(match[0].trim());
      rest = rest.slice(match[0].length);
    }

    return rest.trim();
  });

  return [...imports, ...rules].filter(Boolean).join('\n');
}
