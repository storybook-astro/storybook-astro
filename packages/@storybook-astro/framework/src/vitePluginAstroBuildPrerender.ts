import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin, Rollup } from 'vite';
import type { Integration } from './integrations/index.ts';
import {
  buildStaticModuleMap,
  emitHydratedComponentEntriesFromAstroFile,
  collectTrackedSpecifiers,
  emitBuildEntrypoints,
  loadVirtualBuildModule,
  resolveVirtualBuildModuleId,
  stripQuery
} from './vitePluginAstroBuildShared.ts';
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

    async resolveId(this: Rollup.PluginContext, id: string, importer?: string) {
      const importerPath = stripQuery(importer);

      if (importerPath?.endsWith('.astro')) {
        await emitHydratedComponentEntriesFromAstroFile({
          pluginContext: this,
          astroFilePath: importerPath,
          resolveFrom,
          componentEntrypointRefs
        });
      }

      return resolveVirtualBuildModuleId(id);
    },

    load(id: string) {
      return loadVirtualBuildModule(id);
    },

    async buildStart(this: Rollup.PluginContext) {
      await emitBuildEntrypoints({
        pluginContext: this,
        integrations,
        resolveFrom,
        trackedSpecifiers,
        staticEntrypointRefs
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

/** Writes the prerendered Astro story payload consumed by the static renderer. */
async function writePrerenderedStoriesFile(outDir: string, payload: Record<string, string>) {
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, PRERENDERED_STORIES_FILE), JSON.stringify(payload), 'utf-8');
}

/** Renders Astro stories during the static build and stores the HTML by story id. */
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

/** Reads the built Storybook index and keeps only Astro stories that can be prerendered. */
async function collectAstroStories(outDir: string): Promise<ProductionStoryEntry[]> {
  const indexFile = resolve(outDir, 'index.json');
  const indexRaw = await readFile(indexFile, 'utf-8');
  const indexJson = JSON.parse(indexRaw) as StoryIndex;

  // Static prerender only owns Astro stories. Framework-rendered stories stay
  // with Storybook's normal preview pipeline and are not pre-rendered here.
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

/** Builds lookup tables that map original asset paths to emitted static asset URLs. */
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

/** Rewrites dev-only /@fs/ asset URLs in prerendered HTML to emitted build asset paths. */
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

  // Prerendering happens through a Vite SSR server, so image/style URLs can
  // still point at dev-only /@fs/ paths. Rewrite them to the emitted assets.
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
