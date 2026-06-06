import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Rollup } from 'vite';
import type { Integration } from '../integrations/index.ts';
import { mergeWithAstroConfig } from '../vitePluginAstro.ts';
import { collectHydratedComponentPaths } from '../vitePluginAstroBuildShared.ts';
import type { StaticCssMap, StaticModuleMap } from './staticHtmlRewriting.ts';

export type HydratedComponentAssets = {
  staticModuleMap: StaticModuleMap;
  staticCssMap: StaticCssMap;
};

export type BuildHydratedComponentAssetsOptions = {
  componentPaths: string[];
  integrations: Integration[];
  resolveFrom: string;
  outDir: string;
};

/**
 * Bundles the framework components hydrated inside Astro stories into the static
 * output directory and returns the path/CSS lookups needed to rewrite rendered HTML.
 *
 * Storybook's main Vite build does not include these framework files unless they
 * are imported directly by a `.stories.*` file. Astro stories typically import
 * only the `.astro` wrapper (which gets replaced by a client stub), so without
 * this step their `client:load` islands have no built JS chunk and no extracted
 * CSS — leading to unstyled, unhydrated previews in the static build.
 *
 * Component paths may be absolute filesystem paths, paths relative to `resolveFrom`,
 * or bare package specifiers (e.g. `@my-pkg/components/Foo.astro`). All three are
 * normalized to absolute filesystem paths before reading sources from disk.
 */
export async function buildHydratedComponentAssets(
  options: BuildHydratedComponentAssetsOptions
): Promise<HydratedComponentAssets> {
  const resolveSpecifier = createSpecifierResolver(options.resolveFrom);
  const resolvedComponentPaths = options.componentPaths
    .map(resolveSpecifier)
    .filter((path): path is string => Boolean(path));
  const hydratedComponentPaths = Array.from(
    new Set(
      (
        await Promise.all(
          resolvedComponentPaths.map((componentPath) =>
            collectHydratedComponentPaths(componentPath)
          )
        )
      ).flat()
    )
  );

  if (hydratedComponentPaths.length === 0) {
    return { staticModuleMap: {}, staticCssMap: {} };
  }

  const clientEntrypoints = Array.from(
    new Set(
      options.integrations
        .map((integration) => integration.renderer.client?.entrypoint)
        .filter((entrypoint): entrypoint is string => Boolean(entrypoint))
    )
  );
  const entryNames = Object.fromEntries([
    ...hydratedComponentPaths.map((componentPath, index) => [`component-${index}`, componentPath]),
    ...clientEntrypoints.map((entrypoint, index) => [`renderer-${index}`, entrypoint])
  ]);
  const buildConfig = {
    root: options.resolveFrom,
    build: {
      write: false,
      outDir: options.outDir,
      emptyOutDir: false,
      manifest: false,
      rollupOptions: {
        input: entryNames,
        preserveEntrySignatures: 'strict',
        output: {
          entryFileNames: '_astro/[name]-[hash].js',
          chunkFileNames: '_astro/[name]-[hash].js',
          assetFileNames: '_astro/[name]-[hash][extname]'
        }
      }
    }
  };
  const finalConfig = await mergeWithAstroConfig(
    buildConfig,
    options.integrations,
    options.resolveFrom,
    'production',
    'build'
  );
  const buildOutput = await build(finalConfig);
  const output = Array.isArray(buildOutput)
    ? buildOutput.flatMap((result) => result.output)
    : buildOutput.output;
  const chunksByFileName = new Map<string, Rollup.OutputChunk>();

  for (const item of output) {
    await writeBuildOutputFile(options.outDir, item);

    if (item.type === 'chunk') {
      chunksByFileName.set(item.fileName, item);
    }
  }

  const staticModuleMap: StaticModuleMap = {};
  const staticCssMap: StaticCssMap = {};

  for (const item of output) {
    if (item.type !== 'chunk' || !item.facadeModuleId) {
      continue;
    }

    const normalizedFacadeId = item.facadeModuleId.replace(/\\/g, '/');
    const originalInputSpecifier = entryNames[item.name];

    staticModuleMap[normalizedFacadeId] = `./${item.fileName}`;

    if (originalInputSpecifier && originalInputSpecifier !== normalizedFacadeId) {
      staticModuleMap[originalInputSpecifier] = `./${item.fileName}`;
    }

    // CSS Modules and other shared stylesheets get hoisted into shared chunks
    // when multiple entries reference them. The entry chunk's own importedCss
    // does not list those, so walk transitively through `imports` to find every
    // stylesheet the browser must load alongside this hydrated component.
    const importedCss = collectTransitiveImportedCss(item, chunksByFileName);

    if (importedCss.length > 0) {
      const cssPaths = importedCss.map((fileName) => `./${fileName}`);

      staticCssMap[normalizedFacadeId] = cssPaths;

      if (originalInputSpecifier && originalInputSpecifier !== normalizedFacadeId) {
        staticCssMap[originalInputSpecifier] = cssPaths;
      }
    }
  }

  return { staticModuleMap, staticCssMap };
}

/** Collects every CSS file reachable from the chunk through its transitive JS imports. */
function collectTransitiveImportedCss(
  entry: Rollup.OutputChunk,
  chunksByFileName: Map<string, Rollup.OutputChunk>
): string[] {
  const visited = new Set<string>();
  const css = new Set<string>();
  const queue: Rollup.OutputChunk[] = [entry];

  while (queue.length > 0) {
    const chunk = queue.shift();

    if (!chunk || visited.has(chunk.fileName)) {
      continue;
    }

    visited.add(chunk.fileName);

    for (const file of chunk.viteMetadata?.importedCss ?? new Set<string>()) {
      css.add(file);
    }

    for (const importedFileName of chunk.imports ?? []) {
      const next = chunksByFileName.get(importedFileName);

      if (next) {
        queue.push(next);
      }
    }
  }

  return Array.from(css);
}

async function writeBuildOutputFile(outDir: string, item: Rollup.OutputAsset | Rollup.OutputChunk) {
  const outputPath = resolve(outDir, item.fileName);

  await mkdir(dirname(outputPath), { recursive: true });

  if (item.type === 'asset') {
    await writeFile(outputPath, item.source);

    return;
  }

  await writeFile(outputPath, item.code);
}

/** Resolves Storybook story `componentPath` values (absolute, relative, or bare specifier) to absolute paths. */
function createSpecifierResolver(resolveFrom: string) {
  // createRequire needs a real filename in `resolveFrom`; package.json works
  // even when it does not exist (require.resolve only reads it to find roots).
  const require_ = createRequire(pathToFileURL(resolve(resolveFrom, 'package.json')));

  return (componentPath: string): string | undefined => {
    if (isAbsolute(componentPath)) {
      return componentPath;
    }

    if (componentPath.startsWith('./') || componentPath.startsWith('../')) {
      return resolve(resolveFrom, componentPath);
    }

    try {
      return require_.resolve(componentPath);
    } catch {
      return undefined;
    }
  };
}
