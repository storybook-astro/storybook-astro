import type { StorybookConfigVite, FrameworkOptions } from './types.ts';
import { vitePluginStorybookAstroMiddleware } from './viteStorybookAstroMiddlewarePlugin.ts';
import { viteStorybookRendererFallbackPlugin } from './viteStorybookRendererFallbackPlugin.ts';
import { viteStorybookAstroRendererPlugin } from './viteStorybookAstroRendererPlugin.ts';
import { vitePluginAstroComponentMarker } from './vitePluginAstroComponentMarker.ts';
import { vitePluginAstroBuildPrerender } from './vitePluginAstroBuildPrerender.ts';
import { vitePluginAstroBuildServer } from './vitePluginAstroBuildServer.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { resolveSanitizationOptions } from './lib/sanitization.ts';
import { mergeWithAstroConfig } from './vitePluginAstro.ts';

export const core = {
  builder: '@storybook/builder-vite',
  renderer: '@storybook-astro/renderer'
};

export const viteFinal: StorybookConfigVite['viteFinal'] = async (config, { configType, presets }) => {
  const options = await presets.apply<FrameworkOptions>('frameworkOptions');

  if (!config.plugins) {
    config.plugins = [];
  }

  const integrations = options.integrations ?? [];
  const resolveFrom = options.resolveFrom ?? process.cwd();
  const renderMode = options.renderMode ?? 'server';
  const mode = configType === 'DEVELOPMENT' ? 'development' : 'production';
  const command = configType === 'DEVELOPMENT' ? 'serve' : 'build';

  resolveSanitizationOptions(options.sanitization);

  config.envPrefix = mergeEnvPrefixes(config.envPrefix, 'STORYBOOK_');

  const { vitePlugin: storybookAstroMiddlewarePlugin, viteConfig } =
    await vitePluginStorybookAstroMiddleware(options);

  config.plugins.push(
    viteStorybookRendererFallbackPlugin(integrations),
    viteStorybookAstroRendererPlugin({
      mode,
      renderMode,
      server: options.server
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vitePluginAstroComponentMarker() as any,
    vitePluginAstroVueFallback(),
  );

  if (configType === 'DEVELOPMENT') {
    config.plugins.push(storybookAstroMiddlewarePlugin, ...viteConfig.plugins);
  } else if (renderMode === 'static') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config.plugins.push(vitePluginAstroBuildPrerender(options) as any);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config.plugins.push(vitePluginAstroBuildServer(options) as any);
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

  const finalConfig = await mergeWithAstroConfig(config, integrations, resolveFrom, mode, command);

  // Exclude @astrojs/vue from dependency optimization because it imports
  // virtual modules that esbuild cannot resolve (virtual:@astrojs/vue/app).
  // This must be done after mergeWithAstroConfig to avoid being overwritten.
  if (!finalConfig.optimizeDeps) {
    finalConfig.optimizeDeps = {};
  }
  if (!finalConfig.optimizeDeps.exclude) {
    finalConfig.optimizeDeps.exclude = [];
  }
  if (!finalConfig.optimizeDeps.exclude.includes('@astrojs/vue')) {
    finalConfig.optimizeDeps.exclude.push('@astrojs/vue');
  }
  // Exclude the renderer from Vite's esbuild pre-bundler so that
  // import.meta.hot is preserved in the preview iframe. When installed
  // via npm (not workspace:*), Vite would otherwise pre-bundle the
  // renderer with esbuild, which strips import.meta.hot and causes the
  // renderer to fall back to fetching astro-prerendered-stories.json
  // (a 404 in dev mode) rather than using the Vite HMR channel.
  if (!finalConfig.optimizeDeps.exclude.includes('@storybook-astro/renderer')) {
    finalConfig.optimizeDeps.exclude.push('@storybook-astro/renderer');
  }
  // Mark Vue virtual modules as external so esbuild doesn't try to resolve them
  if (!finalConfig.optimizeDeps.esbuildOptions) {
    finalConfig.optimizeDeps.esbuildOptions = {};
  }
  if (!finalConfig.optimizeDeps.esbuildOptions.external) {
    finalConfig.optimizeDeps.esbuildOptions.external = [];
  }
  const vueVirtualModules = ['virtual:@astrojs/vue/app', 'virtual:astro:vue-app'];

  for (const mod of vueVirtualModules) {
    if (!finalConfig.optimizeDeps.esbuildOptions.external.includes(mod)) {
      finalConfig.optimizeDeps.esbuildOptions.external.push(mod);
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
