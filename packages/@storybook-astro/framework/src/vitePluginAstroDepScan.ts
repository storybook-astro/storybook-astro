/**
 * Teaches Vite's dependency scanner how to read `.astro` files.
 *
 * Vite classifies `.astro` as an "HTML type" and, during the scan, reads the raw
 * file and regex-matches `<script>` blocks out of it. The regex strips HTML
 * comments but not JavaScript ones, so a `<script>` mentioned inside a
 * frontmatter JSDoc comment is matched as if it opened a real script block. The
 * slice that follows starts mid-comment and fails to parse, and because a scan
 * failure is fatal Vite gives up on pre-bundling entirely:
 *
 *     Failed to run dependency scan. Skipping dependency pre-bundling.
 *
 * Everything then gets discovered while tests or the preview are already
 * running, and Vite reloads the page mid-flight to swap in the newly optimized
 * deps. Under `@storybook/addon-vitest` that reload lands during test
 * collection and surfaces as unrelated-looking failures.
 *
 * The scanner only ever needs the import graph, so we hand it exactly that: one
 * `import` statement per specifier the file references. Frontmatter imports are
 * included, which Vite's own extraction misses entirely — fewer deps discovered
 * late means fewer mid-run reloads.
 *
 * Known gap: `import.meta.glob()` inside a `.astro` file is not expanded, so
 * globbed modules stay invisible to the scanner. Vite doesn't crawl frontmatter
 * at all today, so this is no worse than the status quo.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;
const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SCRIPT_SRC = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s'">]+))/i;
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+\*\s+from\s*)['"]([^'"]+)['"]/g;
// `import type { Props } from 'astro/types'` has no runtime module behind it —
// following it leads the scanner into .d.ts files it cannot resolve.
const TYPE_ONLY_STATEMENT = /\b(?:import|export)\s+type\s[^;]*?['"][^'"]+['"]/g;

/**
 * Specifiers the scanner cannot resolve on its own. Astro's virtual modules are
 * served by plugins, and the scanner runs without the user plugin pipeline — so
 * leaving these in would just populate Vite's "missing dependency" warnings.
 */
function isScannable(specifier: string): boolean {
  return !specifier.startsWith('astro:') && !specifier.startsWith('virtual:');
}

function importsIn(code: string): string[] {
  const withoutComments = code
    .replace(BLOCK_COMMENT, '')
    .replace(LINE_COMMENT, '')
    .replace(TYPE_ONLY_STATEMENT, '');
  const specifiers: string[] = [];
  let match;

  IMPORT_SPECIFIER.lastIndex = 0;
  while ((match = IMPORT_SPECIFIER.exec(withoutComments)) !== null) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

/**
 * Collects every module specifier a `.astro` file imports, from its frontmatter
 * and from its `<script>` blocks. Deduplicated, source order preserved.
 */
export function collectAstroScanImports(source: string): string[] {
  const specifiers = new Set<string>();
  const frontmatter = source.match(FRONTMATTER);

  if (frontmatter) {
    importsIn(frontmatter[1]).forEach((specifier) => specifiers.add(specifier));
  }

  // Only look for <script> blocks below the frontmatter. A `<script>` written
  // inside a frontmatter comment is prose, not markup — matching it there is
  // the exact bug this plugin exists to avoid.
  const template = frontmatter ? source.slice(frontmatter[0].length) : source;

  let block;

  SCRIPT_BLOCK.lastIndex = 0;
  while ((block = SCRIPT_BLOCK.exec(template)) !== null) {
    const [, attributes, content] = block;
    const src = SCRIPT_SRC.exec(attributes);

    if (src) {
      specifiers.add(src[1] ?? src[2] ?? src[3]);

      continue;
    }

    importsIn(content).forEach((specifier) => specifiers.add(specifier));
  }

  return Array.from(specifiers).filter(isScannable);
}

/**
 * The JS module the scanner sees in place of the `.astro` source.
 *
 * The trailing `export default {}` matches what Vite's own loader appends for
 * HTML-type files: the bundler resolves exports while crawling, and every story
 * imports its component as a default. Named imports from a `.astro` file are
 * not supported here — nor are they by Vite's loader.
 */
export function astroScanModule(source: string): string {
  const imports = collectAstroScanImports(source).map(
    (specifier) => `import ${JSON.stringify(specifier)};`
  );

  return [...imports, 'export default {};'].join('\n');
}

const ASTRO_FILE = /\.astro$/;

/**
 * Scanner plugin for Vite 8+, whose optimizer runs on Rolldown. Registered via
 * `optimizeDeps.rolldownOptions.plugins`, which the scanner loads ahead of its
 * own plugins — so this `load` wins over Vite's `<script>` extraction.
 */
export function astroDepScanRolldownPlugin() {
  return {
    name: 'storybook-astro:dep-scan',
    load: {
      filter: { id: ASTRO_FILE },
      async handler(id: string) {
        const { readFile } = await import('node:fs/promises');

        return {
          code: astroScanModule(await readFile(id, 'utf-8')),
          moduleType: 'js'
        };
      }
    }
  };
}

/**
 * Scanner plugin for Vite 6 and 7, whose optimizer runs on esbuild. Registered
 * via `optimizeDeps.esbuildOptions.plugins`, which the scanner loads ahead of
 * its own plugin — so these `onLoad` callbacks win over Vite's `<script>`
 * extraction.
 *
 * Resolution is left entirely to Vite: it routes `.astro` into either the
 * `html` or the `file` namespace depending on how the file was imported (bare
 * package specifier vs. relative path), and registers its own loader for both.
 * Claiming both namespaces here covers the same ground without this plugin
 * needing to resolve anything itself.
 */
export function astroDepScanEsbuildPlugin() {
  return {
    name: 'storybook-astro:dep-scan',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup(build: any) {
      const loadAstro = async (args: { path: string }) => {
        const { readFile } = await import('node:fs/promises');
        const { dirname } = await import('node:path');

        return {
          contents: astroScanModule(await readFile(args.path, 'utf-8')),
          loader: 'js',
          resolveDir: dirname(args.path)
        };
      };

      build.onLoad({ filter: ASTRO_FILE, namespace: 'html' }, loadAstro);
      build.onLoad({ filter: ASTRO_FILE, namespace: 'file' }, loadAstro);
    }
  };
}
