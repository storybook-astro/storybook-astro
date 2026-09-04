import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { version as viteVersion } from 'vite';
import type { StorybookConfigVite, FrameworkOptions } from './types.ts';
import { vitePluginStorybookAstroMiddleware } from './viteStorybookAstroMiddlewarePlugin.ts';
import { viteStorybookRendererFallbackPlugin } from './viteStorybookRendererFallbackPlugin.ts';
import { viteStorybookAstroRendererPlugin } from './viteStorybookAstroRendererPlugin.ts';
import { vitePluginAstroComponentMarker } from './vitePluginAstroComponentMarker.ts';
import { vitePluginAstroSvgComponentMarker } from './vitePluginAstroSvgComponentMarker.ts';
import { vitePluginAstroBuildPrerender } from './vitePluginAstroBuildPrerender.ts';
import { vitePluginAstroBuildServer } from './vitePluginAstroBuildServer.ts';
import { vitePluginAstroIntegrationOptsFallback } from './vitePluginAstroIntegrationOptsFallback.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginAstroToolbarFallback } from './vitePluginAstroToolbarFallback.ts';
import { resolveSanitizationOptions } from './lib/sanitization.ts';
import { FRAMEWORK_RUNTIME_PACKAGES } from './lib/hydratedComponentBuild.ts';
import { mergeWithAstroConfig } from './vitePluginAstro.ts';
import {
  astroDepScanEsbuildPlugin,
  astroDepScanRolldownPlugin
} from './vitePluginAstroDepScan.ts';
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
  const frameworkOptions = await presets.apply<FrameworkOptions>('frameworkOptions');
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

  // Story files and renderer glue can resolve physically different copies of
  // a framework package (workspace hoisting limits, nested installs). Two
  // copies of e.g. preact in the preview bundle break hooks at hydration, so
  // force single instances in Storybook's own build too — the island asset
  // build applies the same list (see lib/hydratedComponentBuild.ts).
  config.resolve = {
    ...config.resolve,
    dedupe: Array.from(
      new Set([...(config.resolve?.dedupe ?? []), ...FRAMEWORK_RUNTIME_PACKAGES])
    )
  };

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
  } else if (renderMode === 'static') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config.plugins.push(vitePluginAstroBuildPrerender(options) as any);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config.plugins.push(vitePluginAstroBuildServer(options, clientAstroComponentIds) as any);
  }

  if (configType !== 'DEVELOPMENT') {
    config.build = {
      ...(config.build ?? {}),
      manifest: true
    };

    config.build.rollupOptions = {
      ...(config.build.rollupOptions ?? {}),
      preserveEntrySignatures: 'strict'
    };
  }

  // Add React/ReactDOM aliases for storybook-solidjs compatibility
  if (!config.resolve) {
    config.resolve = {};
  }
  if (!config.resolve.alias) {
    config.resolve.alias = {};
  }
  
  // Ensure React is available for storybook-solidjs
  const aliases = config.resolve.alias as Record<string, string>;

  if (!aliases['react']) {
    aliases['react'] = 'react';
  }
  if (!aliases['react-dom']) {
    aliases['react-dom'] = 'react-dom';
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

  // Mark integration virtual modules as external so the dep bundler doesn't
  // try to resolve them (they are Vite virtual modules with no real package).
  // Vite ≤7 reads these from esbuildOptions; Vite 8+ uses Rolldown and reads
  // them from rolldownOptions. We populate whichever key the running Vite uses.
  const integrationVirtualModules = [
    'virtual:@astrojs/vue/app',
    'virtual:astro:vue-app',
    'astro:react:opts',
    'astro:preact:opts',
    'astro:toolbar:internal'
  ];

  const viteMajor = resolveProjectViteMajor(resolveFrom);

  // Vite ≤7 (esbuild-based optimizer). On Vite 8+ setting esbuildOptions logs a
  // deprecation warning, so only touch it on older Vite.
  if (viteMajor < 8) {
    if (!finalConfig.optimizeDeps.esbuildOptions) {
      finalConfig.optimizeDeps.esbuildOptions = {};
    }
    if (!finalConfig.optimizeDeps.esbuildOptions.external) {
      finalConfig.optimizeDeps.esbuildOptions.external = [];
    }
    for (const mod of integrationVirtualModules) {
      if (!finalConfig.optimizeDeps.esbuildOptions.external.includes(mod)) {
        finalConfig.optimizeDeps.esbuildOptions.external.push(mod);
      }
    }

    if (!finalConfig.optimizeDeps.esbuildOptions.plugins) {
      finalConfig.optimizeDeps.esbuildOptions.plugins = [];
    }
    finalConfig.optimizeDeps.esbuildOptions.plugins.push(astroDepScanEsbuildPlugin());
  }

  // Vite 8+ uses Rolldown for dependency optimization.
  const optimizeDepsMut = finalConfig.optimizeDeps as Record<string, unknown>;
  const rolldownOpts = (optimizeDepsMut.rolldownOptions ?? {}) as {
    external?: string[];
    plugins?: unknown[];
  };

  rolldownOpts.external = Array.from(
    new Set([...(rolldownOpts.external ?? []), ...integrationVirtualModules])
  );

  if (viteMajor >= 8) {
    rolldownOpts.plugins = [...(rolldownOpts.plugins ?? []), astroDepScanRolldownPlugin()];
  }
  optimizeDepsMut.rolldownOptions = rolldownOpts;

  // Vite 8 dev-server compatibility (Astro 7+). Vite ≤7 (Astro 5/6) is unaffected.
  if (configType === 'DEVELOPMENT' && viteMajor >= 8) {
    // Drop @vitejs/plugin-react's Vite 8 native Fast Refresh wrapper. Under
    // Vite 8 the plugin delegates Fast Refresh to a Rolldown builtin
    // (`builtin:vite-react-refresh-wrapper`) that throws
    // "Missing field `moduleType`" while transforming Storybook's iframe.html
    // inline bootstrap script — 500-ing every preview load. There is no
    // config opt-out, so we remove the plugin. React components still render;
    // only Fast Refresh is lost (component edits full-reload instead).
    const stripReactRefreshWrapper = (plugins: unknown[]): unknown[] =>
      plugins
        .map((plugin) => (Array.isArray(plugin) ? stripReactRefreshWrapper(plugin) : plugin))
        .filter(
          (plugin) =>
            !(
              plugin &&
              typeof plugin === 'object' &&
              (plugin as { name?: string }).name === 'vite:react:refresh-wrapper'
            )
        );

    finalConfig.plugins = stripReactRefreshWrapper(
      finalConfig.plugins ?? []
    ) as typeof finalConfig.plugins;

  }

  // Exclude the Storybook renderer entry-previews from dependency optimization.
  // Some ship non-JS source (e.g. `@storybook/svelte`'s `.svelte` files) that
  // the dep scanner cannot load ("No loader is configured for .svelte"), which
  // fails optimization and 504s every renderer entry. Serving them as source
  // lets the framework's own Vite plugins transform them.
  if (configType === 'DEVELOPMENT') {
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
 * Builds the docgen runtime for the props table and description autodocs shows,
 * or returns undefined when extraction shouldn't run at all.
 *
 * Skipped when the user opted out, when the docs addon isn't installed (nothing
 * would render the output), and when Storybook is building for tests — docgen
 * costs a type check per component and none of those need it.
 */
async function createDocgenIfEnabled(
  options: FrameworkOptions,
  projectRoot: string,
  storybookOptions: Parameters<NonNullable<StorybookConfigVite['viteFinal']>>[1]
) {
  if (options.docgen === false || storybookOptions.build?.test?.disableDocgen) {
    return undefined;
  }

  const docsConfig = await storybookOptions.presets.apply('docs', {}, storybookOptions);

  if (Object.keys(docsConfig ?? {}).length === 0) {
    return undefined;
  }

  const { createAstroDocgen } = await import('./docgen/index.ts');

  return createAstroDocgen({ projectRoot, ...options.docgen });
}

/**
 * The Vite major the *project* runs on — not the copy hoisted next to this
 * package. In a monorepo those diverge (an Astro 6 app on Vite 7 alongside a
 * hoisted Vite 8), and every version gate above is about the app's Vite: which
 * optimizer it uses, and which dev-server workarounds it needs.
 */
function resolveProjectViteMajor(resolveFrom: string): number {
  const require = createRequire(import.meta.url);

  try {
    const pkgPath = require.resolve('vite/package.json', { paths: [resolveFrom] });

    return Number.parseInt(require(pkgPath).version, 10);
  } catch {
    return Number.parseInt(viteVersion, 10);
  }
}
