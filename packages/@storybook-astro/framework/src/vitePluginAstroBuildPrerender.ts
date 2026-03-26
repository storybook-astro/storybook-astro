import { createRequire } from 'node:module';
import type { Dirent } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { createServer, mergeConfig, type Plugin, type Rollup } from 'vite';
import { importAstroConfig } from './importAstroConfig.ts';
import type { Integration } from './integrations/index.ts';
import { installPassthroughImageService } from './lib/passthrough-image-service.ts';
import { ssrLoadModuleWithFsFallback } from './lib/ssr-load-module-with-fs-fallback.ts';
import { resolveSanitizationOptions, sanitizeRenderPayload } from './lib/sanitization.ts';
import { resolveStoryModuleMock, withStoryModuleMocks } from './module-mocks.ts';
import { resolveRulesConfigFilePath } from './rules-options.ts';
import { selectStoryRules, withStoryRuleCleanups } from './rules.ts';
import type { FrameworkOptions } from './types.ts';
import { vitePluginAstroFontsFallback } from './vitePluginAstroFontsFallback.ts';
import { vitePluginAstroIntegrationOptsFallback } from './vitePluginAstroIntegrationOptsFallback.ts';
import { vitePluginAstroRoutesFallback } from './vitePluginAstroRoutesFallback.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginStoryModuleMocks } from './vitePluginStoryModuleMocks.ts';

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

type StoryEntry = {
  id: string;
  importPath: string;
  exportName: string;
  title?: string;
  name?: string;
};

type AstroCreateResult = {
  createAstro?: (...args: unknown[]) => unknown;
};

type AstroComponentFactory = ((
  result: AstroCreateResult,
  props: unknown,
  slots: unknown
) => unknown) & {
  isAstroComponentFactory?: boolean;
  moduleId?: string;
  propagation?: unknown;
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
          return [`export { default } from '${specifier}';`, `export * from '${specifier}';`].join('\n');
        }

        return [`import '${specifier}';`, 'export default undefined;'].join('\n');
      }

      if (id.startsWith('\0virtual:astro-component-module/')) {
        const withoutPrefix = id.replace('\0virtual:astro-component-module/', '');
        // Strip the ?component-wrapper query appended by toComponentVirtualId
        const encodedSpecifier = withoutPrefix.replace(/\?.*$/, '');
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

    async writeBundle(this: Rollup.PluginContext, _outputOptions: Rollup.NormalizedOutputOptions, bundle: Rollup.OutputBundle) {
      const staticModuleMap = buildStaticModuleMap(
        this,
        staticEntrypointRefs,
        componentEntrypointRefs
      );

      const stories = await collectAstroStories(outDir);

      if (stories.length === 0) {
        await writePrerenderedStoriesFile(outDir, {});

        return;
      }

      const prerenderedStories = await prerenderStories({
        stories,
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

async function prerenderStories(options: {
  stories: StoryEntry[];
  integrations: Integration[];
  sanitization?: FrameworkOptions['sanitization'];
  storyRulesConfigFilePath?: string;
  staticModuleMap: Record<string, string>;
  trackedSpecifiers: Set<string>;
  resolveFrom: string;
  bundle: Rollup.OutputBundle;
}) {
  const sanitizationOptions = resolveSanitizationOptions(options.sanitization ?? undefined);
  const resolveClientModule = createClientModuleResolver(
    options.integrations,
    options.staticModuleMap
  );
  const viteServer = await createStorySsrServer(
    options.integrations,
    options.trackedSpecifiers,
    options.resolveFrom
  );
  const rulesConfigModule = await loadRulesConfigModule(viteServer, options.storyRulesConfigFilePath);
  const assetPathMap = buildAssetPathMap(options.bundle);

  // Inject a passthrough image service before the container renders any
  // components. The `image: { service: passthroughImageService() }` config
  // passed to Astro above is not sufficient on Astro 6: at render time
  // `getConfiguredImageService()` still dynamically imports
  // "virtual:image-service", which fails in Vite 7's module runner with
  // `InvalidImageService`. Pre-populating globalThis.astroAsset.imageService
  // short-circuits that dynamic import. See `lib/passthrough-image-service.ts`.
  installPassthroughImageService();

  try {
    // Load AstroContainer through the SSR module graph so that internal
    // classes (SlotString, HTMLString) share the same module instance as the
    // Astro components loaded via ssrLoadModule below. Cross-module instanceof
    // checks fail when AstroContainer is imported statically (Node.js context)
    // and components are loaded via Vite SSR (separate module graph), which
    // causes slot HTML to be escaped character-by-character instead of being
    // passed through as raw HTML.
    const containerModule = await viteServer.ssrLoadModule('astro/container');
    const AstroContainerRuntime = containerModule.experimental_AstroContainer as typeof AstroContainer;

    const container = await AstroContainerRuntime.create({
      resolve: async (specifier) => {
        const mockedModule = resolveStoryModuleMock(specifier);

        if (mockedModule) {
          return mockedModule;
        }

        const resolution = resolveClientModule(specifier);

        if (resolution) {
          return resolution;
        }

        return specifier;
      }
    });

    await addContainerRenderers(container, options.integrations, resolveClientModule, viteServer);

    const output: Record<string, string> = {};

    for (const story of options.stories) {
      const selectedRules = await selectStoryRules({
        configModule: rulesConfigModule,
        configFilePath: options.storyRulesConfigFilePath,
        story: {
          id: story.id,
          title: story.title,
          name: story.name
        }
      });

      if (selectedRules.moduleMocks.size > 0) {
        viteServer.moduleGraph.invalidateAll();
      }

      const html = await withStoryRuleCleanups(selectedRules.cleanups, async () => {
        return withStoryModuleMocks(selectedRules.moduleMocks, async () => {
          const modulePath = resolveImportPath(story.importPath, options.resolveFrom);
          const storyModule = await viteServer.ssrLoadModule(modulePath);
          const meta = isRecord(storyModule.default) ? storyModule.default : {};
          const storyExport = isRecord(storyModule[story.exportName])
            ? storyModule[story.exportName]
            : {};

          if (typeof meta.component !== 'function') {
            throw new Error(
              `Unable to prerender story "${story.id}". Missing default export component in ${story.importPath}.`
            );
          }

          if (storyExport.component && storyExport.component !== meta.component) {
            return undefined;
          }

          const mergedArgs = mergeStoryArgs(toRecord(meta.args), toRecord(storyExport.args));
          const { args, slots } = separateSlots(mergedArgs);
          const processedArgs = await processImageMetadata(args);
          const sanitizedPayload = sanitizeRenderPayload(
            {
              args: processedArgs,
              slots
            },
            sanitizationOptions
          );

          return container.renderToString(
            patchCreateAstroCompat(meta.component) as Parameters<typeof container.renderToString>[0],
            {
              props: sanitizedPayload.args,
              slots: sanitizedPayload.slots
            }
          );
        });
      });

      if (html !== undefined) {
        output[story.id] = rewriteAssetPaths(html, assetPathMap);
      }
    }

    return output;
  } finally {
    await viteServer.close();
  }
}

async function createStorySsrServer(
  integrations: Integration[],
  trackedSpecifiers: Set<string>,
  resolveFrom: string
) {
  const { getViteConfig, passthroughImageService } = await importAstroConfig(resolveFrom);
  const astroConfig = await getViteConfig(
    { root: resolveFrom },
    {
      configFile: false,
      integrations: await Promise.all(
        integrations.map((integration) => integration.loadIntegration(resolveFrom))
      ),
      // Use the passthrough image service so nested components that use <Image>
      // from astro:assets render as plain <img> tags without triggering image
      // optimization (which fails in the Storybook SSR context).
      image: { service: passthroughImageService() }
    }
  )({
    mode: 'production',
    command: 'serve'
  });

  const config = mergeConfig(astroConfig, {
    appType: 'custom',
    server: {
      middlewareMode: true
    },
    ssr: {
      // Force Astro runtime modules to be loaded through Vite's SSR transform
      // pipeline rather than being externalized via Node.js native import().
      // Without this, the AstroContainer (loaded via ssrLoadModule) and the
      // component rendering pipeline may resolve internal classes like
      // SlotString/HTMLString from separate module instances, causing
      // instanceof checks to fail and slot HTML to be escaped.
      noExternal: /^astro(\/.+)?$/
    },
    plugins: [
      createProjectAstroResolutionPlugin(resolveFrom),
      vitePluginAstroFontsFallback(),
      vitePluginAstroIntegrationOptsFallback(),
      vitePluginAstroVueFallback(),
      vitePluginAstroRoutesFallback(),
      vitePluginStoryModuleMocks(),
      {
        name: 'storybook-astro:static-prerender-ssr-stubs',
        resolveId(id: string) {
          if (trackedSpecifiers.has(id)) {
            return `\0storybook-astro-static-prerender-stub:${encodeURIComponent(id)}`;
          }
        },
        load(id: string) {
          if (id.startsWith('\0storybook-astro-static-prerender-stub:')) {
            return 'export default undefined;';
          }
        }
      }
    ]
  });

  return createServer(config);
}

async function loadRulesConfigModule(
  viteServer: Awaited<ReturnType<typeof createStorySsrServer>>,
  configFilePath?: string
) {
  if (!configFilePath) {
    return undefined;
  }

  try {
    return await ssrLoadModuleWithFsFallback(viteServer, configFilePath, {
      fixStacktrace: true
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Unable to load framework.options.storyRules config module at ${configFilePath}: ${reason}`
    );
  }
}

async function addContainerRenderers(
  container: Awaited<ReturnType<typeof AstroContainer.create>>,
  integrations: Integration[],
  resolveClientModule: (specifier: string) => string | undefined,
  viteServer: Awaited<ReturnType<typeof createStorySsrServer>>
) {
  for (const integration of integrations) {
    const serverRenderer = integration.renderer.server;

    if (serverRenderer) {
      const serverRendererModule = await viteServer.ssrLoadModule(serverRenderer.entrypoint);
      const renderer = serverRendererModule.default ?? serverRendererModule;

      if (integration.name === 'solid' && isRecord(renderer)) {
        container.addServerRenderer({
          name: serverRenderer.name,
          renderer: {
            ...renderer,
            name: serverRenderer.name
          } as Parameters<typeof container.addServerRenderer>[0]['renderer']
        });
      } else {
        container.addServerRenderer({
          name: serverRenderer.name,
          renderer
        });
      }
    }

    const clientRenderer = integration.renderer.client;

    if (clientRenderer) {
      const resolvedEntrypoint =
        resolveClientModule(clientRenderer.entrypoint) ?? clientRenderer.entrypoint;

      container.addClientRenderer({
        name: clientRenderer.name,
        entrypoint: resolvedEntrypoint
      });
    }
  }
}

function createClientModuleResolver(
  integrations: Integration[],
  staticModuleMap: Record<string, string>
) {
  return function resolveClientModule(specifier: string) {
    if (Object.hasOwn(staticModuleMap, specifier)) {
      return staticModuleMap[specifier];
    }

    const normalizedSpecifier = specifier.replace(/\\/g, '/').replace(/\?.*$/, '');

    if (Object.hasOwn(staticModuleMap, normalizedSpecifier)) {
      return staticModuleMap[normalizedSpecifier];
    }

    for (const integration of integrations) {
      const resolution = integration.resolveClient(specifier);

      if (resolution) {
        return resolution;
      }
    }
  };
}

async function collectAstroStories(outDir: string): Promise<StoryEntry[]> {
  const indexFile = resolve(outDir, 'index.json');
  const indexRaw = await readFile(indexFile, 'utf-8');
  const indexJson = JSON.parse(indexRaw) as StoryIndex;

  return Object.values(indexJson.entries ?? {})
    .filter((entry) => entry.type === 'story' && entry.componentPath?.endsWith('.astro'))
    .map((entry) => {
      if (!entry.id || !entry.importPath || !entry.exportName) {
        throw new Error(`Encountered an invalid Storybook index entry in ${indexFile}.`);
      }

      return {
        id: entry.id,
        importPath: entry.importPath,
        exportName: entry.exportName,
        title: entry.title,
        name: entry.name
      };
    });
}

function mergeStoryArgs(
  metaArgs: Record<string, unknown> | undefined,
  storyArgs: Record<string, unknown> | undefined
) {
  return {
    ...(metaArgs ?? {}),
    ...(storyArgs ?? {})
  };
}

function separateSlots(inputArgs: Record<string, unknown>) {
  const args = { ...inputArgs };
  const slotsCandidate = args.slots;

  delete args.slots;

  if (!isRecord(slotsCandidate)) {
    return {
      args,
      slots: {}
    };
  }

  return {
    args,
    slots: slotsCandidate as Record<string, string>
  };
}

function resolveImportPath(importPath: string, resolveFrom: string) {
  if (importPath.startsWith('./')) {
    return resolve(resolveFrom, importPath.slice(2));
  }

  return resolve(resolveFrom, importPath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return value;
}

function collectTrackedSpecifiers(integrations: Integration[]) {
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

function rewriteAssetPaths(html: string, assetPathMap: ReturnType<typeof buildAssetPathMap>): string {
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

function patchCreateAstroCompat(component: unknown): AstroComponentFactory {
  if (typeof component !== 'function') {
    throw new Error('Expected Astro component factory to be a function.');
  }

  const originalComponent = component as AstroComponentFactory;
  const wrapped = ((result: AstroCreateResult, props: unknown, slots: unknown) => {
    if (result && typeof result.createAstro === 'function') {
      const originalCreateAstro = result.createAstro;
      const runtimeExpectsAstroGlobal = originalCreateAstro.length >= 3;

      result.createAstro = (...args: unknown[]) => {
        if (args.length === 3 && !runtimeExpectsAstroGlobal) {
          return originalCreateAstro(args[1], args[2]);
        }

        return originalCreateAstro(...args);
      };
    }

    return originalComponent(result, props, slots);
  }) as AstroComponentFactory;

  wrapped.isAstroComponentFactory = originalComponent.isAstroComponentFactory;
  wrapped.moduleId = originalComponent.moduleId;
  wrapped.propagation = originalComponent.propagation;

  return wrapped;
}

async function processImageMetadata(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const processed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (isImageMetadata(value)) {
      // Keep ImageMetadata as a plain object — Astro's image service checks
      // isESMImportedImage (typeof src === 'object') and skips the /@fs/ string
      // validation that throws LocalImageUsedWrongly. Converting to a URL string
      // causes that error when the string starts with /@fs/.
      processed[key] = value;

      continue;
    }

    if (Array.isArray(value)) {
      processed[key] = await Promise.all(
        value.map(async (item) => {
          if (isImageMetadata(item)) {
            return item;
          }

          if (isRecord(item)) {
            return processImageMetadata(item);
          }

          return item;
        })
      );

      continue;
    }

    if (isRecord(value)) {
      processed[key] = await processImageMetadata(value);

      continue;
    }

    processed[key] = value;
  }

  return processed;
}

function isImageMetadata(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.src === 'string' &&
    ('width' in value || 'height' in value || 'format' in value)
  );
}


function createProjectAstroResolutionPlugin(resolveFrom: string): Plugin {
  const require = createRequire(import.meta.url);

  return {
    name: 'storybook-astro:resolve-project-astro-prerender',
    enforce: 'pre',
    resolveId(id: string) {
      if (id !== 'astro' && !id.startsWith('astro/')) {
        return null;
      }

      try {
        return require.resolve(id, {
          paths: [resolveFrom]
        });
      } catch {
        return null;
      }
    }
  };
}
