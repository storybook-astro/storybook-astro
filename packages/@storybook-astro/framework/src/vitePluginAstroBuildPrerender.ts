import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
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
import { buildHydratedComponentAssets } from './lib/hydratedComponentBuild.ts';
import {
  addStaticStylesheets,
  rewriteBuiltModulePaths,
  type StaticCssMap,
  type StaticModuleMap
} from './lib/staticHtmlRewriting.ts';
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
      const trackedModuleMap = buildStaticModuleMap(
        this,
        staticEntrypointRefs,
        componentEntrypointRefs
      );

      const astroStories = await collectAstroStories(outDir);

      if (astroStories.length === 0) {
        await writePrerenderedStoriesFile(outDir, {});

        return;
      }

      const storyAstroComponentPaths = Array.from(
        new Set(astroStories.map((story) => story.componentPath))
      );
      // Bundle the framework components hydrated inside Astro stories so the
      // static preview has matching JS chunks and extracted CSS for them.
      // Storybook's own iframe build skips these files when no per-framework
      // .stories.* exists, which left CSS-module styling absent from the
      // prerendered output.
      const hydratedComponentAssets = await buildHydratedComponentAssets({
        componentPaths: storyAstroComponentPaths,
        integrations,
        resolveFrom,
        outDir
      });
      const staticModuleMap: StaticModuleMap = {
        ...trackedModuleMap,
        ...hydratedComponentAssets.staticModuleMap
      };
      const staticCssMap: StaticCssMap = hydratedComponentAssets.staticCssMap;

      const prerenderedStories = await prerenderAstroStories({
        astroStories,
        integrations,
        sanitization: options.sanitization,
        storyRulesConfigFilePath,
        staticModuleMap,
        staticCssMap,
        trackedSpecifiers,
        resolveFrom,
        fonts: options.fonts,
        bundle,
        outDir
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
  staticModuleMap: StaticModuleMap;
  staticCssMap: StaticCssMap;
  trackedSpecifiers: Set<string>;
  resolveFrom: string;
  fonts?: FrameworkOptions['fonts'];
  bundle: Rollup.OutputBundle;
  outDir: string;
}) {
  const runtime = await createProductionRenderRuntime({
    integrations: options.integrations,
    sanitization: options.sanitization,
    storyRulesConfigFilePath: options.storyRulesConfigFilePath,
    staticModuleMap: options.staticModuleMap,
    trackedSpecifiers: options.trackedSpecifiers,
    resolveFrom: options.resolveFrom,
    fonts: options.fonts
  });
  const assetPathMap = buildAssetPathMap(options.bundle);
  // Astro's default public directory; its contents are copied to the output
  // root, so a prerendered `/@fs/<root>/public/...` URL must become `/...`.
  const publicDir = resolve(options.resolveFrom, 'public');

  try {
    const output: Record<string, string> = {};

    for (const story of options.astroStories) {
      const html = await renderProductionStoryToHtml({
        story,
        runtime,
        resolveFrom: options.resolveFrom
      });

      if (html === undefined) {
        continue;
      }

      // Image asset URLs from Vite SSR still point at /@fs/ paths, so rewrite
      // them first; then rewrite hydrated framework component module paths and
      // prepend their extracted CSS so the static preview matches dev styling.
      const htmlWithAssetUrls = rewriteAssetPaths(html, assetPathMap, publicDir, options.outDir);
      const htmlWithBuiltModules = rewriteBuiltModulePaths(
        htmlWithAssetUrls,
        options.staticModuleMap
      );
      const htmlWithStylesheets = addStaticStylesheets(htmlWithBuiltModules, {
        staticModuleMap: options.staticModuleMap,
        staticCssMap: options.staticCssMap
      });

      output[story.id] = htmlWithStylesheets;
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
export function buildAssetPathMap(bundle: Rollup.OutputBundle): Map<string, string> {
  const exactMap = new Map<string, string>();
  const stemMap = new Map<string, string>();
  const ambiguousNames = new Set<string>();

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

    // Images emitted by Astro's asset pipeline carry no originalFileNames, so
    // also index every asset by the file name it was emitted from, e.g.
    // "photo.webp" ⟶ "/_astro/photo-CG2UH-wI.webp". The hashed output name is
    // not parsed for this: the hash itself can contain `-` and `_`.
    for (const name of asset.names) {
      const emittedPath = `/${asset.fileName}`;

      if (stemMap.has(name) && stemMap.get(name) !== emittedPath) {
        ambiguousNames.add(name);
      }
      stemMap.set(name, emittedPath);
    }
  }

  // Two different files with the same name (say `icons/logo.png` and
  // `brand/logo.png`) can't be told apart by name alone. Drop those names so
  // their URLs fall through to the copy below rather than to the wrong image.
  for (const name of ambiguousNames) {
    stemMap.delete(name);
  }

  return { exactMap, stemMap } as unknown as Map<string, string>;
}

/** Rewrites dev-only /@fs/ asset URLs in prerendered HTML to emitted build asset paths. */
export function rewriteAssetPaths(
  html: string,
  assetPathMap: ReturnType<typeof buildAssetPathMap>,
  publicDir: string,
  outDir: string
): string {
  const { exactMap, stemMap } = assetPathMap as unknown as {
    exactMap: Map<string, string>;
    stemMap: Map<string, string>;
  };

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

    // Files under the project's `public/` directory aren't bundle assets — the
    // build copies them verbatim to the output root and serves them from `/`.
    // Map e.g. `/@fs/<root>/public/images/x.png?…` to `/images/x.png`.
    if (absolutePath.startsWith(`${publicDir}/`)) {
      return absolutePath.slice(publicDir.length);
    }

    // Anything else was only imported on the server — an image a component
    // passes to <Image> or getImage() itself, a `?url` import — so the build
    // never emitted it. Copy it into the output instead.
    return copyAssetToOutDir(absolutePath, outDir) ?? match;
  });
}

// File types the copy fallback may publish. Anything else behind a `/@fs/` URL
// (a component's `.astro` or `.tsx` source, say) is a missed rewrite, and
// copying it would publish source code without fixing the reference.
const COPYABLE_ASSET_RE =
  /\.(apng|avif|bmp|gif|ico|jfif|jpe?g|pjp(eg)?|png|svg|tiff?|webp|cur|mp4|webm|ogg|mp3|wav|flac|aac|opus|mov|m4a|vtt|woff2?|eot|ttf|otf|pdf|txt|webmanifest)$/i;

/** Copies an asset file into `_astro/` under a content-hashed name and returns its URL, if it exists. */
function copyAssetToOutDir(filePath: string, outDir: string): string | undefined {
  if (!COPYABLE_ASSET_RE.test(filePath)) {
    return undefined;
  }

  let source: Buffer;

  try {
    source = readFileSync(filePath);
  } catch {
    return undefined;
  }

  const extension = extname(filePath);
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  const fileName = `_astro/${basename(filePath, extension)}-${hash}${extension}`;

  mkdirSync(resolve(outDir, '_astro'), { recursive: true });
  writeFileSync(resolve(outDir, fileName), source);

  return `/${fileName}`;
}
