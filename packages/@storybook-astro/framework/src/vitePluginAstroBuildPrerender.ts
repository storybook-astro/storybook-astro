import type { Dirent } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin, Rollup } from 'vite';
import type { Integration } from './integrations/index.ts';
import {
  createProductionRenderRuntime,
  renderProductionStoryToHtml,
  type ProductionStoryEntry
} from './productionRenderRuntime.ts';
import { resolveRulesConfigFilePath } from './rules-options.ts';
import type { FrameworkOptions } from './types.ts';

const PRERENDERED_STORIES_FILE = 'astro-prerendered-stories.json';

type StoryIndex = {
  entries?: Record<
    string,
    {
      type?: string;
      id?: string;
      importPath?: string;
      exportName?: string;
      componentPath?: string;
      title?: string;
      name?: string;
    }
  >;
};

export function vitePluginAstroBuildPrerender(options: FrameworkOptions): Plugin {
  const integrations = options.integrations ?? [];
  const resolveFrom = options.resolveFrom ?? process.cwd();
  const storyRulesConfigFilePath = resolveRulesConfigFilePath(options.storyRules, resolveFrom);
  const trackedSpecifiers = collectTrackedSpecifiers(integrations);
  const staticEntrypointRefs = new Map<string, string>();
  const componentEntrypointRefs = new Map<string, string>();
  let outDir = resolve(resolveFrom, 'storybook-static');

  return {
    name: 'storybook-astro:build-prerender',
    apply: 'build',
    enforce: 'post',

    configResolved(config) {
      outDir = resolve(resolveFrom, config.build.outDir ?? 'storybook-static');
    },

    resolveId(id: string) {
      if (id.startsWith('virtual:astro-static-module/')) {
        return `\0${id}`;
      }

      if (id.startsWith('virtual:astro-component-module/')) {
        return `\0${id}`;
      }
    },

    load(id: string) {
      if (id.startsWith('\0virtual:astro-static-module/')) {
        const encodedSpecifier = id.replace('\0virtual:astro-static-module/', '');
        const specifier = decodeURIComponent(encodedSpecifier);

        if (isClientEntrypoint(specifier)) {
          return [`export { default } from '${specifier}';`, `export * from '${specifier}';`].join(
            '\n'
          );
        }

        return [`import '${specifier}';`, 'export default undefined;'].join('\n');
      }

      if (id.startsWith('\0virtual:astro-component-module/')) {
        const withoutPrefix = id.replace('\0virtual:astro-component-module/', '');
        // Strip the ?component-wrapper query appended by toComponentVirtualId
        const encodedSpecifier = withoutPrefix.replace(/\?.*$/, '');
        const specifier = decodeURIComponent(encodedSpecifier);

        return [`export { default } from '${specifier}';`, `export * from '${specifier}';`].join(
          '\n'
        );
      }
    },

    async buildStart(this: Rollup.PluginContext) {
      integrations.forEach((integration) => {
        const entrypoint = integration.renderer.client?.entrypoint;

        if (entrypoint) {
          this.addWatchFile(entrypoint);
        }
      });

      trackedSpecifiers.forEach((specifier) => {
        const fileReferenceId = this.emitFile({
          type: 'chunk',
          id: toStaticVirtualId(specifier)
        });

        staticEntrypointRefs.set(specifier, fileReferenceId);
      });

      const componentRootPaths = [
        resolve(resolveFrom, 'src/components'),
        ...(options.renderMode === 'static' && options.componentRoots
          ? options.componentRoots.map((root) => resolve(resolveFrom, root))
          : [])
      ];
      const specifierArrays = await Promise.all(
        componentRootPaths.map((root) => collectHydratableSourceModules(root))
      );
      const specifiers = specifierArrays.flat();

      specifiers.forEach((specifier) => {
        // .svelte and .vue files must be emitted as direct chunks so their
        // native Vite compile plugins process them correctly. The virtual
        // module wrapper exposes a JS re-export stub; vite-plugin-svelte and
        // @vitejs/plugin-vue strip the query string before checking the
        // extension, so they still try to compile the stub as framework source.
        const chunkId = /\.(svelte|vue)$/.test(specifier)
          ? specifier
          : toComponentVirtualId(specifier);

        const fileReferenceId = this.emitFile({ type: 'chunk', id: chunkId });

        componentEntrypointRefs.set(specifier, fileReferenceId);
      });
    },

    async writeBundle(
      this: Rollup.PluginContext,
      _outputOptions: Rollup.NormalizedOutputOptions,
      bundle: Rollup.OutputBundle
    ) {
      const staticModuleMap = buildStaticModuleMap(
        this,
        staticEntrypointRefs,
        componentEntrypointRefs
      );

      const astroStories = await collectAstroStories(outDir);

      if (astroStories.length === 0) {
        await writePrerenderedStoriesFile(outDir, {});

        return;
      }

      const prerenderedStories = await prerenderAstroStories({
        astroStories,
        integrations,
        sanitization: options.sanitization,
        storyRulesConfigFilePath,
        staticModuleMap,
        trackedSpecifiers,
        resolveFrom,
        bundle
      });

      await writePrerenderedStoriesFile(outDir, prerenderedStories);
    }
  };
}

async function writePrerenderedStoriesFile(outDir: string, payload: Record<string, string>) {
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, PRERENDERED_STORIES_FILE), JSON.stringify(payload), 'utf-8');
}

/** Renders each Astro story once during the static build and stores the resulting HTML by story id. */
async function prerenderAstroStories(options: {
  astroStories: ProductionStoryEntry[];
  integrations: Integration[];
  sanitization?: FrameworkOptions['sanitization'];
  storyRulesConfigFilePath?: string;
  staticModuleMap: Record<string, string>;
  trackedSpecifiers: Set<string>;
  resolveFrom: string;
  bundle: Rollup.OutputBundle;
}) {
  const runtime = await createProductionRenderRuntime({
    integrations: options.integrations,
    sanitization: options.sanitization,
    storyRulesConfigFilePath: options.storyRulesConfigFilePath,
    staticModuleMap: options.staticModuleMap,
    trackedSpecifiers: options.trackedSpecifiers,
    resolveFrom: options.resolveFrom
  });
  const assetPathMap = buildAssetPathMap(options.bundle);

  try {
    const output: Record<string, string> = {};

    for (const story of options.astroStories) {
      const html = await renderProductionStoryToHtml({
        story,
        runtime,
        resolveFrom: options.resolveFrom
      });

      if (html !== undefined) {
        output[story.id] = rewriteAssetPaths(html, assetPathMap);
      }
    }

    return output;
  } finally {
    await runtime.close();
  }
}

async function collectAstroStories(outDir: string): Promise<ProductionStoryEntry[]> {
  const indexFile = resolve(outDir, 'index.json');
  const indexRaw = await readFile(indexFile, 'utf-8');
  const indexJson = JSON.parse(indexRaw) as StoryIndex;

  return Object.values(indexJson.entries ?? {})
    .filter((entry) => entry.type === 'story' && entry.componentPath?.endsWith('.astro'))
    .map((entry) => {
      if (!entry.id || !entry.importPath || !entry.exportName || !entry.componentPath) {
        throw new Error(`Encountered an invalid Storybook index entry in ${indexFile}.`);
      }

      return {
        id: entry.id,
        importPath: entry.importPath,
        componentPath: entry.componentPath,
        exportName: entry.exportName,
        title: entry.title,
        name: entry.name
      };
    });
}

function collectTrackedSpecifiers(integrations: Integration[]) {
  const specifiers = new Set<string>([
    'astro:scripts/page.js',
    'astro:scripts/before-hydration.js'
  ]);

  integrations.forEach((integration) => {
    const entrypoint = integration.renderer.client?.entrypoint;

    if (entrypoint) {
      specifiers.add(entrypoint);
    }
  });

  return specifiers;
}

function buildStaticModuleMap(
  pluginContext: Rollup.PluginContext,
  staticEntrypointRefs: Map<string, string>,
  componentEntrypointRefs: Map<string, string>
) {
  const map: Record<string, string> = {};

  staticEntrypointRefs.forEach((fileReferenceId, specifier) => {
    const fileName = pluginContext.getFileName(fileReferenceId);

    if (fileName) {
      map[specifier] = toPublicPath(fileName);
    }
  });

  componentEntrypointRefs.forEach((fileReferenceId, specifier) => {
    const fileName = pluginContext.getFileName(fileReferenceId);

    if (fileName) {
      map[specifier] = toPublicPath(fileName);
    }
  });

  return map;
}

function toStaticVirtualId(specifier: string) {
  return `virtual:astro-static-module/${encodeURIComponent(specifier)}`;
}

function toComponentVirtualId(specifier: string) {
  // Append a non-extension suffix so framework compile plugins (e.g. vite-plugin-svelte)
  // don't match the virtual module ID by extension and try to compile the JS re-export stub.
  return `virtual:astro-component-module/${encodeURIComponent(specifier)}?component-wrapper`;
}

function isClientEntrypoint(specifier: string) {
  return specifier.startsWith('@astrojs/') && specifier.endsWith('/client.js');
}

function toPublicPath(fileName: string) {
  return `./${fileName}`;
}

function buildAssetPathMap(bundle: Rollup.OutputBundle): Map<string, string> {
  const exactMap = new Map<string, string>();
  const stemMap = new Map<string, string>();

  for (const chunk of Object.values(bundle)) {
    if (chunk.type !== 'asset') {
      continue;
    }

    const asset = chunk as Rollup.OutputAsset;

    if (asset.originalFileNames && asset.originalFileNames.length > 0) {
      for (const originalPath of asset.originalFileNames) {
        exactMap.set(originalPath, `/${asset.fileName}`);
      }
    }

    // Vite does not populate originalFileNames for image assets processed
    // through its asset pipeline. Build a secondary lookup by the filename
    // stem so /@fs/ URLs in prerendered HTML can still be mapped to their
    // content-hashed output paths.  e.g. "storybook-astro-CfMmZdup.png" ⟶
    // stem key "storybook-astro.png" ⟶ "/_astro/storybook-astro-CfMmZdup.png".
    const baseName = asset.fileName.split('/').pop() ?? '';
    const stemMatch = baseName.match(/^(.+)-[A-Za-z0-9]{6,12}\.(png|jpe?g|gif|webp|svg|avif|ico)$/);

    if (stemMatch) {
      stemMap.set(`${stemMatch[1]}.${stemMatch[2]}`, `/${asset.fileName}`);
    }
  }

  return { exactMap, stemMap } as unknown as Map<string, string>;
}

function rewriteAssetPaths(
  html: string,
  assetPathMap: ReturnType<typeof buildAssetPathMap>
): string {
  const { exactMap, stemMap } = assetPathMap as unknown as {
    exactMap: Map<string, string>;
    stemMap: Map<string, string>;
  };

  if (exactMap.size === 0 && stemMap.size === 0) {
    return html;
  }

  // Match /@fs/ URLs in HTML attribute values, stripping any query string.
  // Vite dev server uses /@fs//absolute/path for filesystem assets; in static
  // builds these are emitted as /_astro/name.hash.ext output assets.
  // The character class deliberately excludes only quotes (the attribute
  // delimiters) so that paths containing spaces are captured in full.
  return html.replace(/\/@fs\/[^"']+/g, (match) => {
    const pathOnly = match.replace(/\?.*$/, '');
    const fsPath = pathOnly.slice('/@fs'.length);
    // Handle /@fs//abs/path (double leading slash on Unix)
    const absolutePath = fsPath.startsWith('//') ? fsPath.slice(1) : fsPath;

    // Try exact match by originalFileNames first
    const exact = exactMap.get(absolutePath);

    if (exact) {
      return exact;
    }

    // Fall back to stem-based matching for image assets whose
    // originalFileNames are empty (standard Vite asset pipeline behaviour).
    const baseName = absolutePath.split('/').pop() ?? '';
    const stemHit = stemMap.get(baseName);

    if (stemHit) {
      return stemHit;
    }

    return match;
  });
}

async function collectHydratableSourceModules(srcRoot: string): Promise<string[]> {
  const modules: string[] = [];

  async function walk(directory: string) {
    let entries: Dirent[];

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = resolve(directory, entry.name);

        if (entry.isDirectory()) {
          await walk(absolutePath);

          return;
        }

        if (!entry.isFile()) {
          return;
        }

        const normalizedPath = absolutePath.replace(/\\/g, '/');

        if (!isHydratableSourceFile(normalizedPath)) {
          return;
        }

        if (isNonHydratableSourceFile(normalizedPath)) {
          return;
        }

        modules.push(normalizedPath);
      })
    );
  }

  await walk(srcRoot);

  return modules;
}

function isHydratableSourceFile(input: string) {
  // Only framework component extensions — plain .js/.ts are utilities/data
  // files that are not hydratable client components and must not be emitted
  // as entry chunks (they may lack a default export, causing a build error).
  return /\.(jsx|tsx|vue|svelte)$/.test(input);
}

function isNonHydratableSourceFile(input: string) {
  return /\.stories\.[jt]sx?$|\.stories\.vue$|\.stories\.svelte$|\.(spec|test)\.[jt]sx?$/.test(
    input
  );
}
