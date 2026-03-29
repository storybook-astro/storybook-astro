import { readFileSync } from 'node:fs';
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

      // Detect the Astro 6 client-side stub pattern.
      // NOTE: If `experimental.rustCompiler` is enabled in the user's Astro config,
      // the Rust compiler may emit a different stub text, causing this check to miss
      // Astro components (they won't get `isAstroComponentFactory = true` and will
      // render blank in Storybook). Verify this string against the Rust compiler output
      // if/when `experimental.rustCompiler` becomes widely used.
      if (!code.includes('Astro components cannot be used in the browser')) {return null;}

      const moduleId = id;

      // In dev mode, import style sub-modules via Astro's Vite plugin (which has
      // compile metadata cached from the SSR transform).
      // In build mode, Astro's compile metadata cache is not populated for client-side
      // transforms, so sub-module imports would fail. Extract raw CSS instead.
      const styleCode = isBuild
        ? generateInlineStyles(moduleId)
        : generateStyleImports(moduleId);

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
 */
function generateStyleImports(filePath: string): string {
  try {
    const source = readFileSync(filePath, 'utf-8');
    const styleCount = countStyleBlocks(source);

    return Array.from({ length: styleCount }, (_, i) =>
      `import ${JSON.stringify(`${filePath}?astro&type=style&index=${i}&lang.css`)};`
    ).join('\n');
  } catch {
    return '';
  }
}

/**
 * Reads the original .astro source file and generates a JS snippet that injects
 * the raw CSS from each <style> block into the document. Used during builds where
 * Astro's compile metadata cache is unavailable.
 *
 * The CSS is unscoped (no Astro scoping transforms), which is acceptable because
 * Astro components show a fallback message in static builds.
 */
function generateInlineStyles(filePath: string): string {
  try {
    const source = readFileSync(filePath, 'utf-8');
    const cssBlocks = extractStyleBlocks(source);

    if (cssBlocks.length === 0) {return '';}

    // Create a side-effect that injects styles into the document
    return cssBlocks.map((css, i) => {
      const escaped = JSON.stringify(css);

      
return `
(function() {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.setAttribute('data-astro-build', ${JSON.stringify(filePath + ':' + i)});
    style.textContent = ${escaped};
    document.head.appendChild(style);
  }
})();`;
    }).join('\n');
  } catch {
    return '';
  }
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
