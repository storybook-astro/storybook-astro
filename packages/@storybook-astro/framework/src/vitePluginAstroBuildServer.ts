import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { resolveRulesConfigFilePath } from './rules-options.ts';
import type { FrameworkOptions } from './types.ts';
import {
  buildStaticModuleMap,
  buildSnapshotFilePath,
  copyRuntimeSnapshot,
  collectTrackedSpecifiers,
  emitBuildEntrypoints,
  loadVirtualBuildModule,
  resolveVirtualBuildModuleId,
} from './vitePluginAstroBuildShared.ts';
import { buildHydratedComponentAssets } from './lib/hydratedComponentBuild.ts';
import { mergeWithAstroConfig } from './vitePluginAstro.ts';
import { viteAstroContainerRenderersPlugin } from './viteAstroContainerRenderersPlugin.ts';
import { sanitizeConfigPlugin } from './vite/sanitizeConfigPlugin.ts';
import { serverAuthPlugin } from './vite/serverAuthPlugin.ts';
import { serverRuntimePlugin } from './vite/serverRuntimePlugin.ts';
import { storyRulesPlugin } from './vite/storyRulesPlugin.ts';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '.');
// packageRoot works regardless of whether this file is running from src/ or dist/
const packageRoot = resolve(moduleRoot, '..');

export function vitePluginAstroBuildServer(
  options: FrameworkOptions,
  // Every `.astro` file the iframe build's client graph reached (collected by
  // `vitePluginAstroComponentMarker` in the same build, wired up in preset.ts).
  // Union this into the snapshot so a component referenced only from
  // `.storybook/preview.*` (a decorator's Wrapper.astro) or only via a slot/prop
  // marker still reaches the deployed snapshot
  // (docs/specs/decorators.md#server-snapshot) — today only story
  // components make it into the snapshot.
  clientAstroComponentIds: Set<string> = new Set()
) {
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
      // Union in every client-imported .astro id the marker plugin saw during
      // this same build — story components are already a subset of this list,
      // and the union additionally covers decorator/slot/prop-only components.
      const allAstroComponentPaths = Array.from(
        new Set([...storyAstroComponentPaths, ...clientAstroComponentIds])
      );
      const componentPathMap = buildComponentPathMap(allAstroComponentPaths, resolveFrom, snapshotDirName);
      const storyRulesConfigFilePath = resolveRulesConfigFilePath(options.storyRules, resolveFrom);
      const trackedModuleMap = buildStaticModuleMap(this, staticEntrypointRefs, new Map());
      const hydratedComponentAssets = await buildHydratedComponentAssets({
        componentPaths: allAstroComponentPaths,
        integrations,
        resolveFrom,
        outDir: storybookStaticOutDir
      });
      const combinedModuleMap = {
        ...trackedModuleMap,
        ...hydratedComponentAssets.staticModuleMap
      };
      const staticModuleMap = addSnapshotModuleAliases(combinedModuleMap, {
        resolveFrom,
        snapshotRoot: resolve(serverOutDir, snapshotDirName),
        snapshotDirName
      });
      // Snapshot paths keyed relative to the server bundle: the absolute
      // aliases above bake in the build machine's paths, which never match
      // the deploy host's filesystem (e.g. /var/task on Vercel).
      const snapshotModuleAliasMap = buildSnapshotModuleAliasMap(combinedModuleMap, {
        resolveFrom,
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
        snapshotModuleAliasMap,
        staticCssMap,
        trackedSpecifiers: Array.from(trackedSpecifiers),
        resolveFrom
      });

      await copyRuntimeSnapshot({
        resolveFrom,
        snapshotRoot: resolve(serverOutDir, snapshotDirName),
        snapshotDirName,
        astroComponents: allAstroComponentPaths,
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
  snapshotModuleAliasMap: Record<string, string>;
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
      // Compile the story-rules module into the server bundle: deployed
      // hosts (e.g. Vercel) transpile or drop the snapshot's .ts sources,
      // so runtime loading of the copied rules file is not reliable.
      storyRulesPlugin(options.storyRules, options.resolveFrom),
      serverRuntimePlugin({
        integrations: options.integrations,
        storyRules: options.storyRules,
        resolveFrom: options.resolveFrom,
        snapshotDirName: options.snapshotDirName,
        componentPathMap: options.componentPathMap,
        staticModuleMap: options.staticModuleMap,
        snapshotModuleAliasMap: options.snapshotModuleAliasMap,
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

function buildSnapshotModuleAliasMap(
  staticModuleMap: Record<string, string>,
  options: {
    resolveFrom: string;
    snapshotDirName: string;
  }
) {
  const aliasMap: Record<string, string> = {};

  for (const [sourcePath, builtPath] of Object.entries(staticModuleMap)) {
    if (!sourcePath.startsWith('/')) {
      continue;
    }

    aliasMap[buildSnapshotFilePath(options.resolveFrom, sourcePath, options.snapshotDirName)] =
      builtPath;
  }

  return aliasMap;
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
