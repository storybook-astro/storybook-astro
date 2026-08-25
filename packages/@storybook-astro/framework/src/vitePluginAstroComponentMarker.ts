import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { PluginOption } from 'vite';

/**
 * Vite plugin that patches Astro 6's client-side .astro file transforms for Storybook.
 *
 * In Astro 6, the client-side transform of .astro files produces a stub function that
 * throws "Astro components cannot be used in the browser" without setting the
 * `isAstroComponentFactory` marker. Storybook's renderer relies on this marker to detect
 * Astro components and route them to server-side rendering via the Container API.
 *
 * This plugin also preserves the component's scoped CSS by importing the style sub-modules
 * that the Astro Vite plugin exposes. Without this, the client-side stub would strip all
 * CSS since Astro 6 no longer includes style imports in client-side .astro transforms.
 *
 * During builds, Astro's compile metadata cache is not populated for client-side transforms,
 * so style sub-module imports would fail. Instead, raw CSS is extracted directly from the
 * .astro source and inlined.
 */
export function vitePluginAstroComponentMarker(options?: {
  /**
   * Called with the module id of every client-imported `.astro` file this
   * plugin marks. Server-mode builds use this to learn about `.astro`
   * components that never appear in the story index — e.g. a decorator's
   * `Wrapper.astro` imported only from `.storybook/preview.*` — so they can
   * still be copied into the deployed snapshot (docs/specs/decorators.md#server-snapshot).
   */
  onClientAstroModuleId?: (moduleId: string) => void;
}): PluginOption {
  let isBuild = false;

  return {
    name: 'storybook-astro-component-marker',
    enforce: 'post',

    configResolved(config) {
      isBuild = config.command === 'build';
    },

    transform(code: string, id: string) {
      // Only process main .astro modules (not sub-modules like ?astro&type=style)
      if (!id.endsWith('.astro')) {return null;}

      // Detect the Astro client-side stub pattern. Astro 6's Go compiler and
      // Astro 7's Rust compiler (now the default) both emit this same error
      // string in the browser stub, so the single check covers Astro 5–7. If a
      // future compiler changes this text, components will silently miss the
      // `isAstroComponentFactory = true` marker and render blank — update the
      // string here if that happens.
      if (!code.includes('Astro components cannot be used in the browser')) {return null;}

      const moduleId = id;

      options?.onClientAstroModuleId?.(moduleId);

      // In Storybook's Vite 6 setup with separate client/SSR environments, Astro's
      // CSS cache isn't populated for client-side transforms. CSS sub-module imports
      // fail with "No Astro CSS at index N", so we inline the CSS directly.
      // However, we still import child .astro components to bring them into the module
      // graph so the plugin processes them (fix for issue #114).
      const styleCode = isBuild
        ? generateInlineStyles(moduleId)
        : generateHybridStyles(moduleId);

      return {
        code: `
${styleCode}
const __astro_component = () => {
  throw new Error('Astro components are rendered server-side by Storybook.');
};
__astro_component.isAstroComponentFactory = true;
__astro_component.moduleId = ${JSON.stringify(moduleId)};
export default __astro_component;
`,
        map: null,
      };
    },
  };
}

/**
 * Hybrid approach for dev mode: inline CSS for the current component (to avoid
 * Astro's cache issues) but import child .astro components (to bring them into
 * the module graph for processing). This preserves the fix for issue #114 while
 * avoiding "No Astro CSS at index N" errors.
 *
 * Two caveats follow from inlining raw <style> source instead of routing it
 * through Astro's compiler:
 * - Styles are injected globally, not scoped to the component. Plain class
 *   selectors still match the SSR-rendered HTML, but there is no scope isolation
 *   between components in dev.
 * - `:global(...)` wrappers are unwrapped (the browser can't parse them), and
 *   preprocessed blocks (`<style lang="scss">` etc.) are skipped with a warning
 *   since the preprocessor isn't reachable here.
 */
function generateHybridStyles(filePath: string): string {
  try {
    const source = readFileSync(filePath, 'utf-8');

    // Inline this component's own CSS (no recursion into children).
    const inlinedCss = extractStyleBlocksWithLang(source).map((block, i) => {
      if (block.lang && block.lang !== 'css') {
        return warnUnsupportedStyleLang(filePath, block.lang);
      }

      return styleInjectionSnippet(
        'data-astro-dev',
        `${filePath}:${i}`,
        unwrapGlobalSelectors(block.css)
      );
    }).join('\n');

    // Import child .astro components so they enter the module graph
    const childImports = extractAstroImportSpecifiers(source).map(
      (specifier) => `import ${JSON.stringify(specifier)};`
    );

    return [inlinedCss, ...childImports].filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

/**
 * Astro's `:global(...)` wrapper marks a selector as un-scoped. Dev-mode styles
 * are already injected globally, so the wrapper carries no meaning here — and the
 * browser treats `:global()` as an invalid pseudo-class and drops the whole rule.
 * Unwrap it to its inner selector so the rule applies.
 */
function unwrapGlobalSelectors(css: string): string {
  return css.replace(/:global\(\s*([^)]*?)\s*\)/g, '$1');
}

/**
 * Builds a snippet that warns about a preprocessed <style> block we can't inline.
 * Astro's compiler (which would turn scss/less/etc. into CSS) isn't reachable
 * from this client-side transform, and shipping the raw source would break the
 * browser's CSS parser, so we surface a clear console warning instead.
 */
function warnUnsupportedStyleLang(filePath: string, lang: string): string {
  const message =
    `[storybook-astro] Skipping <style lang="${lang}"> in ${filePath}: ` +
    `preprocessed styles are not supported in Storybook dev mode.`;

  return `
(function() {
  if (typeof console !== 'undefined') { console.warn(${JSON.stringify(message)}); }
})();`;
}

/**
 * Builds a self-executing snippet that injects a CSS string into <head> as a
 * <style> tag, tagged with a marker attribute. The marker also dedupes
 * re-injection (e.g. when a module re-evaluates after HMR) so styles don't
 * accumulate in the document.
 */
function styleInjectionSnippet(markerAttr: string, markerValue: string, css: string): string {
  const attr = JSON.stringify(markerAttr);
  const value = JSON.stringify(markerValue);

  return `
(function() {
  if (typeof document === 'undefined') { return; }
  const tagged = document.head.querySelectorAll('style[' + ${attr} + ']');
  for (const node of tagged) {
    if (node.getAttribute(${attr}) === ${value}) { return; }
  }
  const style = document.createElement('style');
  style.setAttribute(${attr}, ${value});
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
})();`;
}

/**
 * Extracts import specifiers ending in `.astro` from a component's frontmatter.
 * Comments are stripped first so commented-out imports don't resurface as
 * broken module requests in the browser.
 */
export function extractAstroImportSpecifiers(source: string): string[] {
  const frontmatterMatch = source.match(/^---([\s\S]*?)---/m);

  if (!frontmatterMatch) {return [];}

  const frontmatter = frontmatterMatch[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  // Matches static imports (`import Child from './Child.astro'`), side-effect
  // imports (`import './Child.astro'`), and dynamic imports (`import('./Child.astro')`).
  const importPattern = /(?:from|import)\s*\(?\s*['"]([^'"]+\.astro)['"]/g;
  const specifiers = new Set<string>();
  let match;

  while ((match = importPattern.exec(frontmatter)) !== null) {
    specifiers.add(match[1]);
  }

  return [...specifiers];
}

/**
 * Reads the original .astro source file and generates a JS snippet that injects
 * the raw CSS from each <style> block into the document, recursing into child
 * .astro components imported via relative paths. Used during builds where
 * Astro's compile metadata cache is unavailable.
 *
 * The CSS is unscoped (no Astro scoping transforms), so `:global(...)` wrappers
 * are unwrapped here too — without that the browser drops the whole rule (e.g.
 * PageCard's `.page-card__image-wrapper :global(img)` sizing).
 */
function generateInlineStyles(filePath: string): string {
  const cssBlocks = collectStyleBlocks(filePath, new Set());

  if (cssBlocks.length === 0) {return '';}

  // Create a side-effect that injects styles into the document
  return cssBlocks
    .map(({ file, css }, i) =>
      styleInjectionSnippet('data-astro-build', `${file}:${i}`, unwrapGlobalSelectors(css))
    )
    .join('\n');
}

/**
 * Collects <style> block contents from a component and its child .astro imports.
 * Only relative specifiers are followed (aliases and packages can't be resolved
 * from disk here). The visited set guards against import cycles.
 */
function collectStyleBlocks(
  filePath: string,
  visited: Set<string>
): Array<{ file: string; css: string }> {
  if (visited.has(filePath)) {return [];}
  visited.add(filePath);

  let source: string;

  try {
    source = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const blocks = extractStyleBlocks(source).map((css) => ({ file: filePath, css }));

  for (const specifier of extractAstroImportSpecifiers(source)) {
    if (!specifier.startsWith('.')) {continue;}

    blocks.push(...collectStyleBlocks(resolve(dirname(filePath), specifier), visited));
  }

  return blocks;
}

/**
 * Extracts the content of all top-level <style> blocks from an Astro component's source.
 * Strips frontmatter before parsing.
 */
function extractStyleBlocks(source: string): string[] {
  return extractStyleBlocksWithLang(source).map((block) => block.css);
}

/**
 * Like {@link extractStyleBlocks}, but also reports each block's `lang` attribute
 * (e.g. "scss") so callers can tell preprocessed styles apart from plain CSS.
 * Returns `null` for the lang when no attribute is present.
 */
function extractStyleBlocksWithLang(source: string): Array<{ css: string; lang: string | null }> {
  const withoutFrontmatter = source.replace(/^---[\s\S]*?---/m, '');
  const blocks: Array<{ css: string; lang: string | null }> = [];
  const regex = /<style((?:\s[^>]*)?)>([\s\S]*?)<\/style>/g;
  let match;

  while ((match = regex.exec(withoutFrontmatter)) !== null) {
    const langMatch = match[1].match(/\blang\s*=\s*['"]?([\w-]+)/);

    blocks.push({ css: match[2].trim(), lang: langMatch ? langMatch[1] : null });
  }

  return blocks;
}
