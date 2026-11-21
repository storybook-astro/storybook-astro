import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ComponentsManifest,
  DocgenProviderDescriptor,
  Manifests,
  Options,
  StoryDocsPayload,
  StoryDocsProvider
} from 'storybook/internal/types';
import type { StorybookConfigVite, FrameworkOptions } from './types.ts';
import { vitePluginStorybookAstroMiddleware } from './viteStorybookAstroMiddlewarePlugin.ts';
import { viteStorybookRendererFallbackPlugin } from './viteStorybookRendererFallbackPlugin.ts';
import { viteStorybookAstroRendererPlugin } from './viteStorybookAstroRendererPlugin.ts';
import { vitePluginAstroComponentMarker } from './vitePluginAstroComponentMarker.ts';
import { vitePluginAstroSvgComponentMarker } from './vitePluginAstroSvgComponentMarker.ts';
import { vitePluginAstroBuildPrerender } from './vitePluginAstroBuildPrerender.ts';
import { vitePluginAstroBuildServer } from './vitePluginAstroBuildServer.ts';
import { vitePluginAstroFonts } from './vitePluginAstroFonts.ts';
import { vitePluginAstroIntegrationOptsFallback } from './vitePluginAstroIntegrationOptsFallback.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginAstroToolbarFallback } from './vitePluginAstroToolbarFallback.ts';
import { resolveSanitizationOptions } from './lib/sanitization.ts';
import { mergeWithAstroConfig } from './vitePluginAstro.ts';
import { vitePluginAstroOptimizeDeps } from './vitePluginAstroOptimizeDeps.ts';
import { vitePluginSkipNativeReactRefresh } from './vitePluginSkipNativeReactRefresh.ts';
import {
  appendUserVitePlugins,
  loadUserAstroFonts,
  loadUserAstroVitePlugins
} from './loadUserAstroConfig.ts';

export const core = {
  builder: '@storybook/builder-vite',
  // Use import.meta.resolve so Storybook receives an absolute file:// URL
  // to the renderer preset rather than a bare package specifier.  When
  // package managers like pnpm use strict node_modules isolation, bare
  // specifiers are resolved from the *project root*, where the renderer
  // (a dep of this framework, not the user's project) is not hoisted.
  // The absolute URL is resolved from *this* file's location where the
  // renderer is always accessible as a direct dependency.
  renderer: import.meta.resolve('@storybook-astro/renderer')
};

export const viteFinal: StorybookConfigVite['viteFinal'] = async (config, storybookOptions) => {
  const { configType, presets, configDir } = storybookOptions;
  // Core hands back the framework's `options`: undefined for `framework: { name }`
  // without them, and null with no framework config (#370).
  const frameworkOptions =
    (await presets.apply<FrameworkOptions | null | undefined>('frameworkOptions')) ?? {};
  const resolveFrom = frameworkOptions.resolveFrom ?? dirname(configDir);

  // Auto-load fonts from the user's astro.config.* when the framework option
  // is omitted entirely. An explicit empty array means "I want no fonts" and
  // is honored as-is.
  const fonts =
    frameworkOptions.fonts === undefined
      ? await loadUserAstroFonts(resolveFrom)
      : frameworkOptions.fonts;

  if (frameworkOptions.fonts === undefined && fonts.length > 0) {
    console.warn(
      `[storybook-astro] Auto-loaded ${fonts.length} font famil${fonts.length === 1 ? 'y' : 'ies'} from astro.config: ${fonts.map((f) => f.cssVariable).join(', ')}`
    );
  }

  const options = {
    ...frameworkOptions,
    resolveFrom,
    fonts
  } satisfies FrameworkOptions;

  if (!config.plugins) {
    config.plugins = [];
  }

  const integrations = options.integrations ?? [];
  const renderMode = options.renderMode ?? 'static';
  const mode = configType === 'DEVELOPMENT' ? 'development' : 'production';
  const command = configType === 'DEVELOPMENT' ? 'serve' : 'build';

  resolveSanitizationOptions(options.sanitization);

  config.envPrefix = mergeEnvPrefixes(config.envPrefix, 'STORYBOOK_');

  const { vitePlugin: storybookAstroMiddlewarePlugin, viteConfig } =
    await vitePluginStorybookAstroMiddleware(options);

  // Every `.astro` file the iframe build's client graph reaches — story
  // components, and anything imported only from `.storybook/preview.*` like a
  // decorator's Wrapper.astro — passes through the marker plugin's `transform`
  // hook. Server-mode builds need that full list to snapshot decorator/slot-only
  // components the story index never mentions
  // (docs/specs/decorators.md#server-snapshot), so collect it here and hand it
  // to `vitePluginAstroBuildServer` below.
  const clientAstroComponentIds = new Set<string>();
  const componentMarkerPlugin = vitePluginAstroComponentMarker({
    onClientAstroModuleId: (moduleId) => clientAstroComponentIds.add(moduleId),
    docgen: await createDocgenIfEnabled(options, resolveFrom, storybookOptions)
  });

  config.plugins.push(
    viteStorybookRendererFallbackPlugin(integrations),
    viteStorybookAstroRendererPlugin({
      mode,
      renderMode,
      server: options.server
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    componentMarkerPlugin as any,
    vitePluginAstroSvgComponentMarker(),
    vitePluginAstroIntegrationOptsFallback(),
    vitePluginAstroToolbarFallback(),
    vitePluginAstroVueFallback()
  );

  if (configType === 'DEVELOPMENT') {
    config.plugins.push(storybookAstroMiddlewarePlugin, ...viteConfig.plugins);
  } else {
    config.plugins.push(vitePluginAstroFonts({ fonts: options.fonts, root: options.resolveFrom }));

    if (renderMode === 'static') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config.plugins.push(vitePluginAstroBuildPrerender(options) as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config.plugins.push(vitePluginAstroBuildServer(options, clientAstroComponentIds) as any);
    }

    config.build = {
      ...(config.build ?? {}),
      manifest: true
    };

    config.build.rollupOptions = {
      ...(config.build.rollupOptions ?? {}),
      preserveEntrySignatures: 'strict'
    };
  }

  const finalConfig = await mergeWithAstroConfig(
    config,
    integrations,
    options.resolveFrom,
    mode,
    command
  );

  // Auto-merge raw Vite plugins declared at `vite.plugins` in the user's
  // astro.config.*.  This covers CSS frameworks added as Vite plugins rather
  // than Astro integrations (e.g. `@tailwindcss/vite`, `unocss/vite`) which
  // the integration auto-loader does not pick up.
  const userVitePlugins = await loadUserAstroVitePlugins(options.resolveFrom);
  const newPlugins = appendUserVitePlugins(finalConfig, userVitePlugins);

  if (newPlugins.length > 0) {
    console.warn(
      `[storybook-astro] Auto-loaded ${newPlugins.length} vite plugin${newPlugins.length === 1 ? '' : 's'} from astro.config: ${newPlugins.map((p) => p.name).join(', ')}`
    );
  }

  // Exclude Astro integration packages from dependency optimization because
  // they import virtual modules that esbuild cannot resolve.
  if (!finalConfig.optimizeDeps) {
    finalConfig.optimizeDeps = {};
  }
  if (!finalConfig.optimizeDeps.exclude) {
    finalConfig.optimizeDeps.exclude = [];
  }
  for (const pkg of [
    '@astrojs/vue',
    '@astrojs/vue/client.js',
    '@astrojs/vue/server.js',
    '@astrojs/react',
    '@astrojs/react/client.js',
    '@astrojs/react/server.js',
    '@astrojs/preact',
    '@astrojs/preact/client.js',
    '@astrojs/preact/server.js'
  ]) {
    if (!finalConfig.optimizeDeps.exclude.includes(pkg)) {
      finalConfig.optimizeDeps.exclude.push(pkg);
    }
  }
  // Exclude the renderer and framework from Vite's esbuild pre-bundler.
  //
  // Renderer: import.meta.hot must be preserved so the HMR channel works.
  // When esbuild pre-bundles it, import.meta.hot is stripped and render
  // responses are never received, producing an infinite loading spinner.
  //
  // Framework: the main entry re-exports browser-safe helpers (definePreview,
  // composeStories, etc.) but also has subpath exports that depend on Vite
  // server APIs. If Vite's dep optimizer scans the package transitively it
  // can pull in createServer and other Node-only code, creating a >50k-line
  // browser bundle that causes duplicate __vite__injectQuery declarations
  // and a SyntaxError that crashes the preview iframe.
  for (const pkg of ['@storybook-astro/renderer', '@storybook-astro/framework']) {
    if (!finalConfig.optimizeDeps.exclude.includes(pkg)) {
      finalConfig.optimizeDeps.exclude.push(pkg);
    }
  }
  // fsevents is a macOS-only native chokidar dep with a .node binary that
  // esbuild's prebundler can't load. storybook/internal/preview-api can pass
  // through the transform pipeline twice when used by CSF Next portable
  // stories, producing a duplicate __vite__injectQuery import in the
  // generated chunk; excluding it from prebundling collapses the duplicate.
  for (const pkg of ['fsevents', 'storybook/internal/preview-api']) {
    if (!finalConfig.optimizeDeps.exclude.includes(pkg)) {
      finalConfig.optimizeDeps.exclude.push(pkg);
    }
  }
  // `@storybook-astro/renderer` is excluded from pre-bundling just above, and
  // `optimizeDeps.exclude` also stops the dependency scanner from crawling into
  // it — so the packages it imports are never found at scan time. Vite then
  // discovers them once the preview is already running and reloads the page to
  // swap in the newly optimized deps. That reload is invisible in Storybook dev,
  // but under `@storybook/addon-vitest` it lands mid test-collection and fails
  // the run. Listing them here gets them pre-bundled up front.
  // `storybook/internal/preview-api` is deliberately absent: it stays excluded
  // for the duplicate-injectQuery reason above.
  if (!finalConfig.optimizeDeps.include) {
    finalConfig.optimizeDeps.include = [];
  }
  const scannerBlindDeps = [
    'storybook/internal/csf',
    'storybook/internal/docs-tools',
    'ts-dedent',
    ...integrations.flatMap((integration) => integration.clientOptimizeDeps ?? [])
  ];

  for (const pkg of scannerBlindDeps) {
    if (!finalConfig.optimizeDeps.include.includes(pkg)) {
      finalConfig.optimizeDeps.include.push(pkg);
    }
  }

  // The optimizer options differ between esbuild (Vite 6/7) and Rolldown
  // (Vite 8), so a plugin sets them once it knows which Vite is running.
  finalConfig.plugins = [...(finalConfig.plugins ?? []), vitePluginAstroOptimizeDeps()];

  if (configType === 'DEVELOPMENT') {
    finalConfig.plugins.push(vitePluginSkipNativeReactRefresh());

    // Exclude the Storybook renderer entry-previews from dependency optimization.
    // Some ship non-JS source (e.g. `@storybook/svelte`'s `.svelte` files) that
    // the dep scanner cannot load ("No loader is configured for .svelte"), which
    // fails optimization and 504s every renderer entry. Serving them as source
    // lets the framework's own Vite plugins transform them.
    const entryPreviews = integrations
      .map((integration) => integration.storybookEntryPreview)
      .filter((specifier): specifier is string => Boolean(specifier));

    for (const specifier of entryPreviews) {
      if (!finalConfig.optimizeDeps.exclude.includes(specifier)) {
        finalConfig.optimizeDeps.exclude.push(specifier);
      }
    }
  }

  return finalConfig;
};

function mergeEnvPrefixes(
  existing: string | string[] | undefined,
  additionalPrefix: string
): string[] {
  const prefixes = Array.isArray(existing) ? existing : existing ? [existing] : [];

  return Array.from(new Set([...prefixes, additionalPrefix]));
}

/**
 * Contributes the Docgen Server provider — a module specifier pointing at
 * `src/docgen/docgen-worker.ts`, which core's worker imports and composes into
 * its provider chain.
 *
 * Only when the Docgen Server flag is on (`features.docgenServer`, or
 * `features.experimentalDocgenServer` before Storybook 11): opt-in on 10.x, on
 * by default on 11 through `isDocgenProviderEnabled`. Otherwise
 * extraction stays in the Vite plugin, which covers our whole `storybook`
 * peer range (docs/specs/docgen.md#design-decisions).
 */
// eslint-disable-next-line camelcase -- the preset key Storybook core reads.
export const experimental_docgenProvider = async (
  existing: DocgenProviderDescriptor[] = [],
  storybookOptions: Options
): Promise<DocgenProviderDescriptor[]> => {
  if (!(await usesDocgenService(storybookOptions))) {
    return existing;
  }

  const whereDocgenRuns = await whereDocgenCanRun(storybookOptions);

  if (whereDocgenRuns === 'nowhere') {
    return existing;
  }

  const frameworkOptions =
    (await storybookOptions.presets.apply<FrameworkOptions | null | undefined>(
      'frameworkOptions'
    )) ?? {};

  // `isDocgenProviderEnabled` keeps the default off for a prop filter, so
  // getting here means the project forced the Docgen Server flag on. The flag
  // wins: the worker is registered and the filter is ignored, with a warning.
  if (whereDocgenRuns === 'builder only') {
    console.warn(
      '[storybook-astro] The `docgen.propFilter` option is ignored when the Docgen Server is enabled: a filter is a function, and the Docgen Server hands its provider plain data across a worker boundary. Turn the feature off to keep your filter.'
    );
  }

  return [
    ...existing,
    {
      moduleSpecifier: fileURLToPath(
        import.meta.resolve('@storybook-astro/framework/docgen-worker')
      ),
      options: {
        projectRoot: frameworkOptions.resolveFrom ?? dirname(storybookOptions.configDir),
        // `docgen` isn't `false` here: `whereDocgenCanRun` returned early.
        tsconfigPath: frameworkOptions.docgen ? frameworkOptions.docgen.tsconfigPath : undefined,
        // A static build writes the payloads into the output, and the stories
        // in it are pre-rendered, so their controls can't change anything
        // (issue #375). Matches the `isStaticMode` the preview gets.
        prerendered:
          storybookOptions.configType !== 'DEVELOPMENT' &&
          (frameworkOptions.renderMode ?? 'static') === 'static'
      }
    }
  ];
};

/**
 * Gives Storybook's story docs service, which AI agents read through
 * `docs-show` and `docs-show-story`, each Astro story's description and an
 * Astro snippet from the generator behind Show code. Stories files that don't
 * document an `.astro` component go on to the next provider.
 *
 * Core applies this preset only when the Docgen Server is on, so it needs no
 * flag check of its own. The builder is imported on the first request, since
 * the `csf-tools` helpers it uses landed in Storybook 10.6 and this file loads
 * on every version in our peer range.
 */
// eslint-disable-next-line camelcase -- the preset key Storybook core reads.
export const experimental_storyDocsProvider = async (
  next: StoryDocsProvider
): Promise<StoryDocsProvider> => {
  return async (input) => {
    let ours: StoryDocsPayload | undefined;

    try {
      const { buildStoryDocsPayload } = await import('./docgen/story-docs-payload.ts');

      ours = await buildStoryDocsPayload(input);
    } catch {
      // A stories file this provider can't handle, or a module that fails to
      // load on this Storybook version, shouldn't fail the request: the rest
      // of the chain may still document it, as `@storybook/vue3` does.
      return next(input);
    }

    // Merged over the rest of the chain, as `@storybook/react` merges its own.
    return ours ? { ...(await next(input)), ...ours } : next(input);
  };
};

/**
 * Declares which engine produced the Docgen Server's payloads. With the
 * components manifest also enabled, core builds `components.json` from those
 * payloads but requires the renderer to name the engine: it doesn't infer it,
 * and fails the build without one (issue #183).
 */
// eslint-disable-next-line camelcase -- the preset key Storybook core reads.
export const experimental_manifests = async (
  existing: Manifests = {},
  storybookOptions: Options
): Promise<Manifests> => {
  if (!(await usesDocgenService(storybookOptions))) {
    return existing;
  }

  // Core types `meta.docgen` as a union of its first-party engines. The value
  // is only displayed (in the `components.html` debugger), so naming ours is
  // safe until the union has an entry for it.
  const docgen = 'astro-docgen' as NonNullable<ComponentsManifest['meta']>['docgen'];

  return {
    ...existing,
    components: { v: 0, components: {}, meta: { docgen, durationMs: 0 } }
  };
};

/**
 * Storybook 11's default for `features.docgenServer`, as `@storybook/react` and
 * `@storybook/vue3` provide it. Storybook 10 doesn't read this hook, so there
 * the Docgen Server stays opt-in.
 *
 * Off where only the builder path can extract (see `whereDocgenCanRun`), and
 * with no usable `typescript`. In that last case neither path extracts props.
 * The extractor warns about it on whichever path ends up running, so the
 * project sees one message rather than Storybook's and then ours (issue #367).
 * Without addon-docs the builder path doesn't run the extractor, so the hook
 * gives the same warning itself, unless the main config sets `docgenServer`
 * (see `mainConfigSetsDocgenServer`); `@storybook/addon-mcp` still turns the
 * components manifest on there, and would otherwise get no props with no
 * reason given. Core's `isTypeScriptReadyForDocgen` would warn, so this uses
 * the check behind it. That shipped in 11.0.0-alpha.9 and isn't in 10.x,
 * so it's looked up rather than imported by name, which would fail to load on
 * 10.x.
 */
export const isDocgenProviderEnabled = async (
  _existing: unknown,
  storybookOptions: Options
): Promise<boolean> => {
  if ((await whereDocgenCanRun(storybookOptions)) !== 'anywhere') {
    return false;
  }

  const { getTypeScriptForDocgenError } = (await import('storybook/internal/common')) as {
    getTypeScriptForDocgenError?: (resolve: (specifier: string) => string) => Error | undefined;
  };

  if (typeof getTypeScriptForDocgenError !== 'function') {
    return false;
  }

  // Resolved from this package, which declares `typescript` as a peer, so a
  // strict package manager finds the copy the docgen worker will import.
  const typescriptError = getTypeScriptForDocgenError((specifier) =>
    import.meta.resolve(specifier)
  );

  if (typescriptError === undefined) {
    return true;
  }

  const docsConfig = await storybookOptions.presets.apply('docs', {}, storybookOptions);

  if (Object.keys(docsConfig ?? {}).length > 0) {
    return false;
  }

  // A `docgenServer` the main config sets either way means this warning isn't
  // ours to give: on `false` nothing extracts, and on `true` the worker's
  // extractor reports the missing TypeScript itself.
  if (await mainConfigSetsDocgenServer(storybookOptions)) {
    return false;
  }

  // The extractor's own sentences (`docgen/index.ts`), so the project reads the
  // same message whichever of the two reports it. Core reports only a missing
  // package or a TypeScript 7 or later; an older TypeScript passes this check,
  // and the extractor warns that it's too old. The check reads `data.version`
  // because the TypeScript 7 message needs the version and only that error
  // carries it, though the error's `name`
  // (`SB_CORE-COMMON_0034 (TypeScriptWithoutCompilerApiError)`) would also
  // identify it.
  const version = (typescriptError as { data?: { version?: unknown } }).data?.version;

  if (typeof version === 'string') {
    warnOnce(
      `TypeScript ${version} does not include the compiler API that documentation extraction uses, so component descriptions and props tables are skipped. To get them, keep TypeScript 7 and install TypeScript 6 alongside it as \`typescript\`: https://storybook.js.org/docs/configure/integration/typescript#typescript-7`
    );
  } else {
    warnOnce(
      'TypeScript is not installed, so component descriptions and props tables are skipped. Install TypeScript 5 or 6 to get them.'
    );
  }

  return false;
};

/**
 * Where docgen can run in this Storybook, decided in one place for every hook
 * that gates on it, so they can't disagree (issue #367):
 *
 * - `'nowhere'`: a test build, which skips docgen since it costs a type check
 *   per component and nothing in it renders a props table, or `docgen: false`.
 * - `'builder only'`: a custom `docgen.propFilter`. A filter is a function, and
 *   the Docgen Server hands its provider plain data across a worker boundary.
 * - `'anywhere'`: the Docgen Server or the Vite plugin.
 */
async function whereDocgenCanRun(
  storybookOptions: Options
): Promise<'nowhere' | 'builder only' | 'anywhere'> {
  if (storybookOptions.build?.test?.disableDocgen) {
    return 'nowhere';
  }

  const { docgen } =
    (await storybookOptions.presets.apply<FrameworkOptions | null | undefined>(
      'frameworkOptions'
    )) ?? {};

  if (docgen === false) {
    return 'nowhere';
  }

  return docgen?.propFilter ? 'builder only' : 'anywhere';
}

/**
 * Turns on the components manifest that `@storybook/addon-mcp` reads on
 * Storybook 11, as `@storybook/react` and `@storybook/vue3` do. A
 * `componentsManifest` set in the project's main config is merged after this,
 * so it wins either way. Where the Docgen Server ends up off, core writes no
 * Astro entries to the manifest, which is also what happens when
 * `@storybook/addon-mcp` turns the manifest on itself. Storybook 10 keeps the
 * manifest opt-in.
 */
export const features = async (
  existing: Record<string, unknown> = {}
): Promise<Record<string, unknown>> => {
  const { flag } = await docgenServerFlags();

  if (flag !== 'docgenServer') {
    return existing;
  }

  return { ...existing, componentsManifest: true };
};

/**
 * Whether the Docgen Server owns extraction instead of the Vite plugin.
 *
 * Two things have to line up. The Docgen Server flag has to be on (opt-in on
 * 10.x, default on 11), and their Storybook has to actually ship the provider helpers the
 * worker is built on — those landed in 10.6, while our peer range goes back to
 * 10.0. On an older Storybook we say so and stay on the builder path, which
 * produces the same table.
 *
 * All callers go through this so the two paths can never both run: a worker
 * thread has its own module registry, so enabling both would pay the
 * TypeScript warm-up twice for identical output.
 */
async function usesDocgenService(storybookOptions: Options): Promise<boolean> {
  // Typed against the Storybook we build with, which knows only one of the names.
  const resolvedFeatures = (await storybookOptions.presets.apply('features', {})) as Record<
    string,
    unknown
  >;
  const { flag, ignoredFlag } = await docgenServerFlags();

  if (resolvedFeatures[ignoredFlag] === true && resolvedFeatures[flag] !== true) {
    warnOnce(
      `\`features.${ignoredFlag}\` has no effect on this version of Storybook; it reads \`features.${flag}\`. Component documentation is still extracted in the builder.`
    );
  }

  if (resolvedFeatures[flag] !== true) {
    return false;
  }

  const common = (await import('storybook/internal/common')) as Record<string, unknown>;
  const supported =
    typeof common.createLazyDocgenMiddleware === 'function' &&
    typeof common.createMetaComponentResolver === 'function';

  if (!supported) {
    warnOnce(
      `\`features.${flag}\` needs Storybook 10.6 or newer. Component documentation is still being extracted — in the builder, as it was before — so your props tables are unaffected. Upgrade Storybook to move extraction off the dev server.`
    );
  }

  return supported;
}

/**
 * Whether the main config sets `features.docgenServer` to a boolean, read as
 * core's own `getDocgenServerInMainConfig` reads it. Core applies
 * `isDocgenProviderEnabled` whatever the main config says, so the hook checks
 * this before warning. Only that rare warning path reads the main config.
 */
async function mainConfigSetsDocgenServer(storybookOptions: Options): Promise<boolean> {
  const { loadMainConfig } = (await import('storybook/internal/common')) as {
    loadMainConfig?: (options: { configDir: string }) => Promise<{ features?: unknown }>;
  };

  if (typeof loadMainConfig !== 'function') {
    return false;
  }

  try {
    const { features } = await loadMainConfig({ configDir: storybookOptions.configDir });

    return (
      typeof features === 'object' &&
      features !== null &&
      typeof (features as { docgenServer?: unknown }).docgenServer === 'boolean'
    );
  } catch {
    return false;
  }
}

/**
 * The Docgen Server flag the running Storybook reads, and the one it ignores.
 * Storybook 11 renamed `experimentalDocgenServer` to `docgenServer` and stopped
 * reading the old name; 10.x reads only the old one. Honoring the name core
 * ignores would switch off builder docgen while core never starts the service,
 * leaving every props table empty.
 */
async function docgenServerFlags() {
  const { versions } = await import('storybook/internal/common');
  const isStorybook11 = Number.parseInt(versions.storybook, 10) >= 11;

  return isStorybook11
    ? ({ flag: 'docgenServer', ignoredFlag: 'experimentalDocgenServer' } as const)
    : ({ flag: 'experimentalDocgenServer', ignoredFlag: 'docgenServer' } as const);
}

const warned = new Set<string>();

function warnOnce(message: string) {
  if (warned.has(message)) {
    return;
  }

  warned.add(message);
  console.warn(`[storybook-astro] ${message}`);
}

/**
 * Builds the docgen runtime for the props table and description autodocs shows,
 * or returns undefined when extraction shouldn't run at all.
 *
 * Skipped when the user opted out, when the Docgen Server is handling
 * extraction instead, when the docs addon isn't installed (nothing would render
 * the output), and when Storybook is building for tests — docgen costs a type
 * check per component and none of those need it.
 */
async function createDocgenIfEnabled(
  options: FrameworkOptions,
  projectRoot: string,
  storybookOptions: Parameters<NonNullable<StorybookConfigVite['viteFinal']>>[1]
) {
  if ((await whereDocgenCanRun(storybookOptions)) === 'nowhere') {
    return undefined;
  }

  if (await usesDocgenService(storybookOptions)) {
    return undefined;
  }

  const docsConfig = await storybookOptions.presets.apply('docs', {}, storybookOptions);

  if (Object.keys(docsConfig ?? {}).length === 0) {
    return undefined;
  }

  const { createAstroDocgen } = await import('./docgen/index.ts');

  return createAstroDocgen({ projectRoot, ...options.docgen });
}
