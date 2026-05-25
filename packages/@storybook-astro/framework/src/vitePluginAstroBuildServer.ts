import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { resolveRulesConfigFilePath } from './rules-options.ts';
import type { FrameworkOptions } from './types.ts';
import {
  buildStaticCssMap,
  buildStaticModuleMap,
  buildSnapshotFilePath,
  copyRuntimeSnapshot,
  trackHydratedComponentImport,
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
  const storiesMap = new Map<string, Set<string>>();
  const trackedSpecifiers = collectTrackedSpecifiers(integrations);
  const staticEntrypointRefs = new Map<string, string>();
  const componentEntrypointRefs = new Map<string, string>();
  let storybookStaticOutDir = resolve(resolveFrom, 'storybook-static');

  return {
    name: 'storybook-astro:build-server',
    apply: 'build',
    enforce: 'post',

    configResolved(config: { build: { outDir?: string } }) {
      storybookStaticOutDir = resolve(resolveFrom, config.build.outDir ?? 'storybook-static');
    },

    resolveId(this: Rollup.PluginContext, id: string, importer?: string) {
      if (id.endsWith('.astro') && importer) {
        const absoluteAstroPath = resolve(dirname(importer), id);

        if (!storiesMap.has(absoluteAstroPath)) {
          storiesMap.set(absoluteAstroPath, new Set());
        }

        storiesMap.get(absoluteAstroPath)?.add(importer);
      }

      trackHydratedComponentImport({
        pluginContext: this,
        importer,
        id,
        resolveFrom,
        componentEntrypointRefs
      });

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
      const astroComponents = Array.from(storiesMap.keys());
      const staticModuleMap = buildStaticModuleMap(this, staticEntrypointRefs, componentEntrypointRefs);
      const staticCssMap = buildStaticCssMap(this, bundle, componentEntrypointRefs);
      const serverOutDir = resolve(dirname(storybookStaticOutDir), 'storybook-server');
      const snapshotDirName = 'project';
      const componentPathMap = buildComponentPathMap(astroComponents, resolveFrom, snapshotDirName);
      const storyRulesConfigFilePath = resolveRulesConfigFilePath(options.storyRules, resolveFrom);

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
        astroComponents,
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
      buildSnapshotFilePath(resolveFrom, componentPath, snapshotDirName)
    ])
  );
}
