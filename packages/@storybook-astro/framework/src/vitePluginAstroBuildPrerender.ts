import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import type { HandlerProps } from './middleware.ts';
import type { FrameworkOptions } from './types.ts';
import { createViteServer } from './viteStorybookAstroMiddlewarePlugin.ts';

/**
 * Vite plugin that pre-renders Astro component stories at build time.
 *
 * During `storybook build`, this plugin:
 * 1. Creates an internal Vite SSR server with AstroContainer
 * 2. Detects story files that import Astro components
 * 3. Loads each story module via ssrLoadModule to get fully evaluated args
 *    (including imported assets, computed values, etc.)
 * 4. Renders each story variant using AstroContainer
 * 5. Injects the pre-rendered HTML as a story parameter (`__astroPrerendered`)
 *
 * The renderer checks for this parameter in static builds and uses the
 * pre-rendered HTML directly instead of showing a fallback message.
 *
 * Limitations:
 * - Controls panel changes won't update Astro components (HTML is static)
 * - Build time increases with the number of Astro stories
 * - Stories that override the meta component are skipped
 */
export function vitePluginAstroBuildPrerender(options: FrameworkOptions): Plugin {
  const safeIntegrations = options.integrations ?? [];
  const resolveFrom = options.resolveFrom ?? process.cwd();
  let viteServer: ViteDevServer | null = null;
  let handler: ((data: HandlerProps) => Promise<string>) | null = null;

  // Maps placeholder strings to Rollup emitted-file reference IDs.
  // Placeholders are injected into pre-rendered HTML during transform,
  // then resolved to final asset paths in renderChunk.
  const assetRefIds = new Map<string, string>();

  return {
    name: 'storybook-astro-build-prerender',
    apply: 'build',
    enforce: 'post',

    async buildStart() {
      try {
        viteServer = await createViteServer(safeIntegrations, resolveFrom);

        const filePath = fileURLToPath(new URL('./middleware', import.meta.url));
        const middleware = await viteServer.ssrLoadModule(filePath, {
          fixStacktrace: true
        });

        handler = await middleware.handlerFactory(safeIntegrations, {
          sanitization: options.sanitization
        });
      } catch (err) {
        console.warn(
          '[storybook-astro] Failed to create pre-render server:',
          err instanceof Error ? err.message : err
        );
      }
    },

    async transform(code, id) {
      if (!handler || !viteServer) {return null;}

      // Only process story files
      if (!/\.stories\.(jsx?|tsx?|mjs)$/.test(id)) {return null;}

      // Parse AST to find .astro imports
      const ast = this.parse(code);
      const astroImport = findFirstAstroImport(ast);

      if (!astroImport) {return null;}

      // Resolve the .astro import to an absolute path
      const resolved = await this.resolve(astroImport.source, id);

      if (!resolved) {return null;}
      const componentPath = resolved.id;

      // Load the story module via SSR to get fully evaluated args
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let storyModule: Record<string, any>;

      try {
        storyModule = await viteServer.ssrLoadModule(id);
      } catch (err) {
        console.warn(
          `[storybook-astro] Failed to load story for pre-render: ${id}`,
          err instanceof Error ? err.message : err
        );
        
return null;
      }

      const meta = storyModule.default || {};

      // Confirm the meta component is an Astro component
      if (!meta.component?.isAstroComponentFactory) {return null;}

      // Find all named exports that are story objects
      const storyNames = Object.keys(storyModule).filter(
        (k) =>
          k !== 'default' &&
          k !== '__esModule' &&
          typeof storyModule[k] === 'object' &&
          storyModule[k] !== null
      );

      if (storyNames.length === 0) {return null;}

      // Pre-render each story
      const prerendered: Record<string, string> = {};

      for (const name of storyNames) {
        const story = storyModule[name];

        // Skip stories that override the component — the resolved path
        // corresponds to the meta component and may not match
        if (story.component && story.component !== meta.component) {continue;}

        // Merge meta args with story args (story args take precedence)
        const mergedArgs = { ...meta.args, ...story.args };
        const { slots = {}, ...componentArgs } = mergedArgs;

        try {
          const html = await handler({
            component: componentPath,
            args: componentArgs,
            slots: (slots ?? {}) as Record<string, unknown>
          });
          // Rewrite /@fs dev-server URLs to Rollup asset placeholders.
          // The actual files are emitted via this.emitFile and the
          // placeholders are resolved to final paths in renderChunk.

          prerendered[name] = emitAndRewriteAssetUrls(html, this, assetRefIds);
        } catch (err) {
          console.warn(
            `[storybook-astro] Pre-render failed for "${name}" in ${id}:`,
            err instanceof Error ? err.message : err
          );
        }
      }

      if (Object.keys(prerendered).length === 0) {return null;}

      // Append code that injects pre-rendered HTML as story parameters.
      // This runs as module-level side effects during import, before
      // Storybook reads the story exports.
      const injections = Object.entries(prerendered).map(
        ([name, html]) =>
          `if (typeof ${name} !== 'undefined' && ${name} && typeof ${name} === 'object') {\n` +
          `  ${name}.parameters = Object.assign({}, ${name}.parameters, ` +
          `{ __astroPrerendered: ${JSON.stringify(html)} });\n` +
          `}`
      );

      return {
        code:
          code +
          '\n// Pre-rendered by storybook-astro-build-prerender\n' +
          injections.join('\n'),
        map: null
      };
    },

    renderChunk(code) {
      if (assetRefIds.size === 0) {return null;}

      let result = code;
      let modified = false;

      for (const [placeholder, refId] of assetRefIds) {
        if (!result.includes(placeholder)) {continue;}
        const fileName = this.getFileName(refId);

        result = result.replaceAll(placeholder, fileName);
        modified = true;
      }

      return modified ? { code: result, map: null } : null;
    },

    async buildEnd() {
      if (viteServer) {
        await viteServer.close();
        viteServer = null;
        handler = null;
      }
    }
  };
}

/**
 * Finds the first import declaration with a .astro source in the ESTree AST.
 */
function findFirstAstroImport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ast: any
): { local: string; source: string } | null {
  for (const node of ast.body) {
    if (
      node.type === 'ImportDeclaration' &&
      typeof node.source.value === 'string' &&
      node.source.value.endsWith('.astro')
    ) {
      const defaultSpecifier = node.specifiers?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => s.type === 'ImportDefaultSpecifier'
      );

      if (defaultSpecifier) {
        return {
          local: defaultSpecifier.local.name,
          source: node.source.value
        };
      }
    }
  }
  
return null;
}

/**
 * Finds /@fs dev-server URLs in pre-rendered HTML, emits the referenced
 * files as Rollup assets, and replaces the URLs with placeholders that
 * are resolved to final paths in renderChunk.
 */
function emitAndRewriteAssetUrls(
  html: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  refIds: Map<string, string>
): string {
  // Match /@fs URLs in HTML attribute values.
  // The URL may have a query string with HTML-encoded & (&#38;).
  // Note: file paths may contain spaces, so we match until the closing quote.
  return html.replace(/\/@fs([^"'>]+)/g, (fullMatch, rawPath: string) => {
    // Strip query string (may contain &#38; or &)
    const pathOnly = rawPath.split('?')[0];

    try {
      const source = readFileSync(pathOnly);
      const name = basename(pathOnly);
      const refId = ctx.emitFile({ type: 'asset', name, source });
      const placeholder = `__ASTRO_PRERENDER_ASSET_${refId}__`;

      refIds.set(placeholder, refId);
      
return placeholder;
    } catch {
      return fullMatch;
    }
  });
}
