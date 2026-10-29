import { readFileSync } from 'node:fs';
import type { PluginOption } from 'vite';
import type { AstroDocgen } from './docgen/index.ts';

/**
 * Vite plugin that patches Astro 6's client-side .astro file transforms for Storybook.
 *
 * In Astro 6, the client-side transform of .astro files produces a stub function that
 * throws "Astro components cannot be used in the browser" without setting the
 * `isAstroComponentFactory` marker. Storybook's renderer relies on this marker to detect
 * Astro components and route them to server-side rendering via the Container API.
 *
 * The stub carries no CSS. A component's scoped styles arrive with its server-rendered
 * HTML instead, compiled by Astro (`lib/componentStyles.ts`, issue #189).
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
  /**
   * Extracts the component's props and description so Storybook's autodocs can
   * render them. The result rides along on the stub as `__docgenInfo`, which is
   * where the renderer's `extractArgTypes` reads it from
   * (docs/specs/docgen.md#design-decisions). Omitted when the Docgen Server is
   * handling extraction instead, or when the user turned docgen off.
   */
  docgen?: AstroDocgen;
}): PluginOption {
  let isBuild = false;

  return {
    name: 'storybook-astro-component-marker',
    enforce: 'post',

    configResolved(config) {
      isBuild = config.command === 'build';
    },

    buildStart() {
      // Loading TypeScript and warming its language service costs about a
      // second, once. Kicking it off here without awaiting overlaps that with
      // Storybook's own boot instead of landing on the first story request.
      void options?.docgen?.warmUp();
    },

    configureServer(server) {
      // A component's docgen depends on files it imports, so an edit to a
      // shared `types.ts` has to invalidate the components that read it.
      // Vite's watcher ignores node_modules, so installs still need a restart.
      for (const event of ['change', 'add', 'unlink'] as const) {
        server.watcher.on(event, (changedPath: string) => {
          options?.docgen?.invalidate(changedPath);
        });
      }
    },

    async transform(code: string, id: string) {
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

      // In dev, re-import the component's child .astro files so they join the
      // client module graph: editing a child then updates this stub through HMR,
      // and the story rerenders with the child's new markup and styles.
      const childImports = isBuild ? '' : generateChildImports(moduleId);

      const docgenCode = await generateDocgenAssignment(options?.docgen, moduleId);

      return {
        code: `
${childImports}
const __astro_component = () => {
  throw new Error('Astro components are rendered server-side by Storybook.');
};
__astro_component.isAstroComponentFactory = true;
__astro_component.moduleId = ${JSON.stringify(moduleId)};
${docgenCode}
export default __astro_component;
`,
        map: null,
      };
    },
  };
}

/**
 * Builds the `__docgenInfo` assignment Storybook's autodocs reads, or an empty
 * string when there is nothing to attach.
 *
 * Docgen is a side channel: a component that can't be analysed still renders,
 * so every failure here degrades to no documentation rather than a broken
 * transform (docs/specs/docgen.md#failure-modes).
 */
async function generateDocgenAssignment(
  docgen: AstroDocgen | undefined,
  filePath: string
): Promise<string> {
  if (!docgen) {
    return '';
  }

  try {
    const info = await docgen.extract(filePath, readFileSync(filePath, 'utf-8'));

    return info ? `__astro_component.__docgenInfo = ${JSON.stringify(info)};` : '';
  } catch {
    return '';
  }
}

/** Builds side-effect imports for the child .astro components a component's frontmatter imports. */
function generateChildImports(filePath: string): string {
  try {
    return extractAstroImportSpecifiers(readFileSync(filePath, 'utf-8'))
      .map((specifier) => `import ${JSON.stringify(specifier)};`)
      .join('\n');
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
