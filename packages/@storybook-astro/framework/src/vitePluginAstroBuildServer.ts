import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { build, type Rollup } from 'vite';
import { resolveRulesConfigFilePath } from './rules-options.ts';
import type { FrameworkOptions } from './types.ts';
import {
  buildStaticModuleMap,
  buildSnapshotFilePath,
  collectHydratedComponentPaths,
  copyRuntimeSnapshot,
  collectTrackedSpecifiers,
  emitBuildEntrypoints,
  loadVirtualBuildModule,
  resolveVirtualBuildModuleId,
} from './vitePluginAstroBuildShared.ts';
import { mergeWithAstroConfig } from './vitePluginAstro.ts';
import { viteAstroContainerRenderersPlugin } from './viteAstroContainerRenderersPlugin.ts';
import { sanitizeConfigPlugin } from './vite/sanitizeConfigPlugin.ts';
import { serverAuthPlugin } from './vite/serverAuthPlugin.ts';
import { serverRuntimePlugin } from './vite/serverRuntimePlugin.ts';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '.');
// packageRoot works regardless of whether this file is running from src/ or dist/
const packageRoot = resolve(moduleRoot, '..');

export function vitePluginAstroBuildServer(options: FrameworkOptions) {
  const integrations = options.integrations ?? [];
  const resolveFrom = options.resolveFrom ?? process.cwd();
  const trackedSpecifiers = collectTrackedSpecifiers(integrations);
  const staticEntrypointRefs = new Map<string, string>();
  let storybookStaticOutDir = resolve(resolveFrom, 'storybook-static');

  return {
    name: 'storybook-astro:build-server',
    apply: 'build',
    enforce: 'post',

    configResolved(config: { build: { outDir?: string } }) {
      storybookStaticOutDir = resolve(resolveFrom, config.build.outDir ?? 'storybook-static');
    },

    resolveId(id: string) {
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
      _outputOptions: Rollup.NormalizedOutputOptions
    ) {
      const serverOutDir = resolve(dirname(storybookStaticOutDir), 'storybook-server');
      const snapshotDirName = 'project';
      const astroStories = await collectAstroStories(storybookStaticOutDir, resolveFrom);
      const storyAstroComponentPaths = Array.from(new Set(astroStories.map((story) => story.componentPath)));
      const componentPathMap = buildComponentPathMap(storyAstroComponentPaths, resolveFrom, snapshotDirName);
      const storyRulesConfigFilePath = resolveRulesConfigFilePath(options.storyRules, resolveFrom);
      const trackedModuleMap = buildStaticModuleMap(this, staticEntrypointRefs, new Map());
      const hydratedComponentAssets = await buildHydratedComponentAssets({
        componentPaths: storyAstroComponentPaths,
        integrations,
        resolveFrom,
        outDir: storybookStaticOutDir
      });
      const staticModuleMap = addSnapshotModuleAliases({
        ...trackedModuleMap,
        ...hydratedComponentAssets.staticModuleMap
      }, {
        resolveFrom,
        snapshotRoot: resolve(serverOutDir, snapshotDirName),
        snapshotDirName
      });
      const staticCssMap = hydratedComponentAssets.staticCssMap;

      await buildAstroServer({
        integrations,
        sanitization: options.sanitization,
        storyRules: options.storyRules,
        server: options.server,
        outDir: serverOutDir,
        snapshotDirName,
        componentPathMap,
        staticModuleMap,
        staticCssMap,
        trackedSpecifiers: Array.from(trackedSpecifiers),
        resolveFrom
      });

      await copyRuntimeSnapshot({
        resolveFrom,
        snapshotRoot: resolve(serverOutDir, snapshotDirName),
        snapshotDirName,
        astroComponents: storyAstroComponentPaths,
        storyRulesConfigFilePath
      });
    }
  };
}

/** Builds the standalone Astro render server used by server-mode Storybook output. */
async function buildAstroServer(options: {
  integrations: NonNullable<FrameworkOptions['integrations']>;
  sanitization?: FrameworkOptions['sanitization'];
  storyRules?: FrameworkOptions['storyRules'];
  server?: FrameworkOptions['server'];
  outDir: string;
  snapshotDirName: string;
  componentPathMap: Record<string, string>;
  staticModuleMap: Record<string, string>;
  staticCssMap: Record<string, string[]>;
  trackedSpecifiers: string[];
  resolveFrom: string;
}) {
  const buildConfig = {
    root: resolve(packageRoot, 'src/server'),
    ssr: {
      noExternal: /(@astrojs\/.+|react|react-dom)/
    },
    build: {
      ssr: true,
      outDir: options.outDir,
      emptyOutDir: true,
      sourcemap: true,
      manifest: false,
      rollupOptions: {
        input: resolve(packageRoot, 'src/server/index.ts'),
        treeshake: true
      }
    },
    plugins: [
      sanitizeConfigPlugin(options.sanitization),
      serverAuthPlugin(options.server),
      serverRuntimePlugin({
        integrations: options.integrations,
        storyRules: options.storyRules,
        resolveFrom: options.resolveFrom,
        snapshotDirName: options.snapshotDirName,
        componentPathMap: options.componentPathMap,
        staticModuleMap: options.staticModuleMap,
        staticCssMap: options.staticCssMap,
        trackedSpecifiers: options.trackedSpecifiers
      }),
      viteAstroContainerRenderersPlugin(options.integrations, {
        mode: 'production',
        staticModuleMap: options.staticModuleMap
      })
    ]
  };

  const finalConfig = await mergeWithAstroConfig(
    buildConfig,
    options.integrations,
    options.resolveFrom,
    'production',
    'build'
  );

  await build(finalConfig);
}

/** Rewrites Astro component module ids so the standalone server loads them from the snapshot tree. */
function buildComponentPathMap(
  astroComponents: string[],
  resolveFrom: string,
  snapshotDirName: string
) {
  // The built render server loads Astro component modules from the snapshot,
  // not from the original project root that existed during the build.
  return Object.fromEntries(
    astroComponents.map((componentPath) => [
      componentPath,
      buildSnapshotFilePath(resolveFrom, componentPath, snapshotDirName).replace(
        new RegExp(`^${snapshotDirName}/`),
        ''
      )
    ])
  );
}

async function collectAstroStories(outDir: string, resolveFrom: string) {
  const indexFile = resolve(outDir, 'index.json');
  const indexRaw = await import('node:fs/promises').then(({ readFile }) => readFile(indexFile, 'utf-8'));
  const indexJson = JSON.parse(indexRaw) as {
    entries?: Record<string, { type?: string; componentPath?: string; importPath?: string; exportName?: string }>
  };

  return Object.values(indexJson.entries ?? [])
    .filter((entry) => entry.type === 'story' && entry.componentPath?.endsWith('.astro'))
    .map((entry) => ({
      componentPath: entry.componentPath?.startsWith('./') || entry.componentPath?.startsWith('../')
        ? resolve(resolveFrom, entry.componentPath)
        : entry.componentPath
    }))
    .filter((entry): entry is { componentPath: string } => Boolean(entry.componentPath));
}

async function buildHydratedComponentAssets(options: {
  componentPaths: string[];
  integrations: NonNullable<FrameworkOptions['integrations']>;
  resolveFrom: string;
  outDir: string;
}) {
  const hydratedComponentPaths = Array.from(
    new Set((await Promise.all(options.componentPaths.map((componentPath) => collectHydratedComponentPaths(componentPath)))).flat())
  );

  if (hydratedComponentPaths.length === 0) {
    return {
      staticModuleMap: {},
      staticCssMap: {}
    };
  }

  const clientEntrypoints = Array.from(
    new Set(
      options.integrations
        .map((integration) => integration.renderer.client?.entrypoint)
        .filter((entrypoint): entrypoint is string => Boolean(entrypoint))
    )
  );
  const entryNames = Object.fromEntries(
    [
      ...hydratedComponentPaths.map((componentPath, index) => [`component-${index}`, componentPath]),
      ...clientEntrypoints.map((entrypoint, index) => [`renderer-${index}`, entrypoint])
    ]
  );
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
  const output = Array.isArray(buildOutput) ? buildOutput.flatMap((result) => result.output) : buildOutput.output;
  const staticModuleMap: Record<string, string> = {};
  const staticCssMap: Record<string, string[]> = {};

  for (const item of output) {
    await writeBuildOutputFile(options.outDir, item);

    if (item.type !== 'chunk' || !item.facadeModuleId) {
      continue;
    }

    const normalizedFacadeId = item.facadeModuleId.replace(/\\/g, '/');
    const originalInputSpecifier = entryNames[item.name];

    staticModuleMap[normalizedFacadeId] = `./${item.fileName}`;

    if (originalInputSpecifier && originalInputSpecifier !== normalizedFacadeId) {
      staticModuleMap[originalInputSpecifier] = `./${item.fileName}`;
    }

    const importedCss = Array.from((item.viteMetadata?.importedCss ?? new Set<string>()).values());

    if (importedCss.length > 0) {
      staticCssMap[normalizedFacadeId] = importedCss.map((fileName) => `./${fileName}`);

      if (originalInputSpecifier && originalInputSpecifier !== normalizedFacadeId) {
        staticCssMap[originalInputSpecifier] = importedCss.map((fileName) => `./${fileName}`);
      }
    }
  }

  return {
    staticModuleMap,
    staticCssMap
  };
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

function addSnapshotModuleAliases(
  staticModuleMap: Record<string, string>,
  options: {
    resolveFrom: string;
    snapshotRoot: string;
    snapshotDirName: string;
  }
) {
  const mapWithSnapshotPaths = { ...staticModuleMap };

  for (const [sourcePath, builtPath] of Object.entries(staticModuleMap)) {
    if (!sourcePath.startsWith('/')) {
      continue;
    }

    const snapshotPath = resolve(
      dirname(options.snapshotRoot),
      buildSnapshotFilePath(options.resolveFrom, sourcePath, options.snapshotDirName)
    ).replace(/\\/g, '/');

    mapWithSnapshotPaths[snapshotPath] = builtPath;
  }

  return mapWithSnapshotPaths;
}
