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
export function vitePluginAstroComponentMarker(): PluginOption {
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

      // Detect the Astro 6 client-side stub pattern
      if (!code.includes('Astro components cannot be used in the browser')) {return null;}

      const moduleId = id;

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
 * Reads the original .astro source file and generates import statements
 * for each <style> block, using the Astro Vite plugin's sub-module convention.
 *
 * Child .astro components imported in the frontmatter are re-imported too.
 * Only the server renders children, so without these imports the child modules
 * never enter the browser's module graph and their scoped styles never load.
 * Each child passes through this same plugin, so style loading is transitive.
 */
function generateStyleImports(filePath: string): string {
  try {
    const source = readFileSync(filePath, 'utf-8');
    const styleCount = countStyleBlocks(source);

    const styleImports = Array.from({ length: styleCount }, (_, i) =>
      `import ${JSON.stringify(`${filePath}?astro&type=style&index=${i}&lang.css`)};`
    );
    const childImports = extractAstroImportSpecifiers(source).map(
      (specifier) => `import ${JSON.stringify(specifier)};`
    );

    return [...styleImports, ...childImports].join('\n');
  } catch {
    return '';
  }
}

/**
 * Hybrid approach for dev mode: inline CSS for the current component (to avoid
 * Astro's cache issues) but import child .astro components (to bring them into
 * the module graph for processing). This preserves the fix for issue #114 while
 * avoiding "No Astro CSS at index N" errors.
 */
function generateHybridStyles(filePath: string): string {
  try {
    const source = readFileSync(filePath, 'utf-8');

    // Inline CSS for this component only (no recursion)
    const blocks = extractStyleBlocks(source);
    const inlinedCss = blocks.map((css, i) => {
      const escaped = JSON.stringify(css);
      return `
(function() {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.setAttribute('data-astro-dev', ${JSON.stringify(filePath + ':' + i)});
    style.textContent = ${escaped};
    document.head.appendChild(style);
  }
})();`;
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
 * The CSS is unscoped (no Astro scoping transforms), which is acceptable because
 * Astro components show a fallback message in static builds.
 */
function generateInlineStyles(filePath: string): string {
  const cssBlocks = collectStyleBlocks(filePath, new Set());

  if (cssBlocks.length === 0) {return '';}

  // Create a side-effect that injects styles into the document
  return cssBlocks.map(({ file, css }, i) => {
    const escaped = JSON.stringify(css);


return `
(function() {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.setAttribute('data-astro-build', ${JSON.stringify(file + ':' + i)});
    style.textContent = ${escaped};
    document.head.appendChild(style);
  }
})();`;
  }).join('\n');
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
  const withoutFrontmatter = source.replace(/^---[\s\S]*?---/m, '');
  const blocks: string[] = [];
  const regex = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/g;
  let match;

  while ((match = regex.exec(withoutFrontmatter)) !== null) {
    blocks.push(match[1].trim());
  }

  return blocks;
}

/**
 * Counts the number of top-level <style> blocks in an Astro component's source.
 * Only counts opening tags that are NOT inside the frontmatter fence (---).
 */
function countStyleBlocks(source: string): number {
  // Strip frontmatter
  const withoutFrontmatter = source.replace(/^---[\s\S]*?---/m, '');
  // Match <style> opening tags (with optional attributes)
  const matches = withoutFrontmatter.match(/<style(\s|>)/g);

  
return matches ? matches.length : 0;
}
