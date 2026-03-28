import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import type { FrameworkOptions } from './types.ts';
import { mergeWithAstroConfig } from './vitePluginAstro.ts';
import { viteAstroContainerRenderersPlugin } from './viteAstroContainerRenderersPlugin.ts';
import { astroFilesVirtualModulePlugin } from './vite/astroFilesVirtualModulePlugin.ts';
import { storybookAstroStoryRulesConfigVirtualModulePlugin } from './vite/storybookAstroRulesConfigVirtualModulePlugin.ts';
import { storybookAstroSanitizationConfigVirtualModulePlugin } from './vite/storybookAstroSanitizationConfigVirtualModulePlugin.ts';
import { storybookAstroServerAuthConfigVirtualModulePlugin } from './vite/storybookAstroServerAuthConfigVirtualModulePlugin.ts';

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

    resolveId(id: string, importer?: string) {
      if (id.endsWith('.astro') && importer) {
        const absoluteAstroPath = resolve(dirname(importer), id);

        if (!storiesMap.has(absoluteAstroPath)) {
          storiesMap.set(absoluteAstroPath, new Set());
        }

        storiesMap.get(absoluteAstroPath)?.add(importer);
      }

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
          return [`export { default } from '${specifier}';`, `export * from '${specifier}';`].join('\n');
        }

        return [`import '${specifier}';`, 'export default undefined;'].join('\n');
      }

      if (id.startsWith('\0virtual:astro-component-module/')) {
        const encodedSpecifier = id.replace('\0virtual:astro-component-module/', '');
        const specifier = decodeURIComponent(encodedSpecifier);

        return [`export { default } from '${specifier}';`, `export * from '${specifier}';`].join('\n');
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

      const srcRoot = resolve(resolveFrom, 'src/components');
      const specifiers = await collectHydratableSourceModules(srcRoot);

      specifiers.forEach((specifier) => {
        const fileReferenceId = this.emitFile({
          type: 'chunk',
          id: toComponentVirtualId(specifier)
        });

        componentEntrypointRefs.set(specifier, fileReferenceId);
      });
    },

    async writeBundle(this: Rollup.PluginContext) {
      const astroComponents = Array.from(storiesMap.keys());
      const staticModuleMap = buildStaticModuleMap(
        this,
        staticEntrypointRefs,
        componentEntrypointRefs
      );
      const serverOutDir = resolve(dirname(storybookStaticOutDir), 'storybook-server');

      await buildAstroServer({
        astroComponents,
        integrations,
        sanitization: options.sanitization,
        storyRules: options.storyRules,
        server: options.server,
        outDir: serverOutDir,
        staticModuleMap,
        resolveFrom
      });
    }
  };
}

async function buildAstroServer(options: {
  astroComponents: string[];
  integrations: FrameworkOptions['integrations'];
  sanitization?: FrameworkOptions['sanitization'];
  storyRules?: FrameworkOptions['storyRules'];
  server?: FrameworkOptions['server'];
  outDir: string;
  staticModuleMap: Record<string, string>;
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
      astroFilesVirtualModulePlugin(options.astroComponents),
      storybookAstroSanitizationConfigVirtualModulePlugin(options.sanitization),
      storybookAstroStoryRulesConfigVirtualModulePlugin(options.storyRules, options.resolveFrom),
      storybookAstroServerAuthConfigVirtualModulePlugin(options.server),
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

function collectTrackedSpecifiers(integrations: FrameworkOptions['integrations']) {
  const specifiers = new Set<string>(['astro:scripts/page.js', 'astro:scripts/before-hydration.js']);

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
  return `virtual:astro-component-module/${encodeURIComponent(specifier)}`;
}

function isClientEntrypoint(specifier: string) {
  return specifier.startsWith('@astrojs/') && specifier.endsWith('/client.js');
}

function toPublicPath(fileName: string) {
  return `./${fileName}`;
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
  return /\.(jsx|tsx|vue|svelte|js|ts)$/.test(input);
}

function isNonHydratableSourceFile(input: string) {
  return /\.stories\.[jt]sx?$|\.stories\.vue$|\.stories\.svelte$|\.(spec|test)\.[jt]sx?$/.test(
    input
  );
}
