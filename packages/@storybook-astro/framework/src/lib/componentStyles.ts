import type { ModuleNode, ViteDevServer } from 'vite';

// The sub-module Astro's Vite plugin creates for each `<style>` block, e.g.
// `Card.astro?astro&type=style&index=0&lang.css` (or `&lang.scss`, …).
const ASTRO_STYLE_MODULE = /\?astro&type=style&index=\d+&lang\.\w+$/;

export type ComponentStyles = {
  css: string;
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
 * are in its module graph. One failure doesn't drop the other components'
 * CSS: it's reported in `failures` for the caller to warn about or fail on.
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
    // Look up by file first: a component imported by a story file outside the
    // project root is registered under a `/@fs/` URL, not its plain path.
    // The file's other modules are skipped: they include style sub-modules
    // Vite never prunes, so a deleted `<style>` block would still be listed.
    // The component module's current imports reach the live ones.
    const componentModules = [...(viteServer.moduleGraph.getModulesByFile(componentId) ?? [])].filter(
      (module) => !module.id?.includes('?')
    );
    const module = componentModules.length
      ? undefined
      : await viteServer.moduleGraph.getModuleByUrl(componentId, true);

    if (!componentModules.length && !module) {
      failures.push({
        moduleId: componentId,
        error: new Error('The component is not in the SSR module graph, so its styles were not found.')
      });
      continue;
    }

    (module ? [module] : componentModules).forEach(collect);
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

  const cssBlocks = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value ? [result.value] : [];
    }

    failures.push({ moduleId: styleModules[index], error: result.reason });

    return [];
  });

  return { css: joinStylesheets(cssBlocks), failures };
}

// What may come before a block's rules: `@charset`, `@layer` order statements
// and `@import`s, which Vite leaves in place when it can't inline them (a
// remote URL, for example). Comments may sit between them.
const LEADING_AT_RULE =
  /^(?:\s|\/\*[\s\S]*?\*\/)*(@charset\s+"[^"]*"\s*;|@layer\s+[^;{]+;|@import\s+(?:"[^"]*"|'[^']*'|url\([^)]*\))[^;]*;)/;

/**
 * Joins style blocks into one stylesheet. Browsers ignore an `@import` that
 * comes after other rules, so each block's leading `@import`s, and the `@layer`
 * statements that may precede them, move to the top. `@charset` is dropped:
 * browsers ignore it inside a `<style>` element.
 */
function joinStylesheets(cssBlocks: string[]) {
  const preludes: string[] = [];
  const rules = cssBlocks.map((css) => {
    let rest = css;
    let match: RegExpExecArray | null;

    while ((match = LEADING_AT_RULE.exec(rest))) {
      if (!match[1].startsWith('@charset')) {
        preludes.push(match[1]);
      }
      rest = rest.slice(match[0].length);
    }

    return rest.trim();
  });

  return [...preludes, ...rules].filter(Boolean).join('\n');
}
