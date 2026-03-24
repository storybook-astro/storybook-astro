import type { StorybookConfigVite, FrameworkOptions } from './types.ts';
import { vitePluginStorybookAstroMiddleware } from './viteStorybookAstroMiddlewarePlugin.ts';
import { viteStorybookRendererFallbackPlugin } from './viteStorybookRendererFallbackPlugin.ts';
import { vitePluginAstroComponentMarker } from './vitePluginAstroComponentMarker.ts';
import { vitePluginAstroBuildPrerender } from './vitePluginAstroBuildPrerender.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
import { vitePluginAstroIntegrationOptsFallback } from './vitePluginAstroIntegrationOptsFallback.ts';
import { resolveSanitizationOptions } from './lib/sanitization.ts';
import { mergeWithAstroConfig } from './vitePluginAstro.ts';

export const core = {
  builder: '@storybook/builder-vite',
  renderer: '@storybook-astro/renderer'
};

export const viteFinal: StorybookConfigVite['viteFinal'] = async (config, { configType, presets }) => {
  const options = await presets.apply<FrameworkOptions>('frameworkOptions');
  const { vitePlugin: storybookAstroMiddlewarePlugin, viteConfig } =
    await vitePluginStorybookAstroMiddleware(options);

  if (!config.plugins) {
    config.plugins = [];
  }

  const integrations = options.integrations ?? [];
  const resolveFrom = options.resolveFrom ?? process.cwd();
  const mode = configType === 'DEVELOPMENT' ? 'development' : 'production';
  const command = configType === 'DEVELOPMENT' ? 'serve' : 'build';

  resolveSanitizationOptions(options.sanitization);

  config.plugins.push(
    storybookAstroMiddlewarePlugin,
    viteStorybookRendererFallbackPlugin(integrations),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vitePluginAstroComponentMarker() as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vitePluginAstroBuildPrerender(options) as any,
    vitePluginAstroVueFallback(),
    vitePluginAstroIntegrationOptsFallback(),
    ...viteConfig.plugins
  );

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

  // Exclude Astro framework integration packages from Vite's esbuild dep
  // pre-bundler. These packages import virtual modules (e.g. virtual:@astrojs/vue/app,
  // astro:react:opts, astro:preact:opts) that esbuild cannot resolve. This
  // must be done after mergeWithAstroConfig to avoid being overwritten.
  if (!finalConfig.optimizeDeps) {
    finalConfig.optimizeDeps = {};
  }
  if (!finalConfig.optimizeDeps.exclude) {
    finalConfig.optimizeDeps.exclude = [];
  }
  for (const pkg of ['@astrojs/vue', '@astrojs/react', '@astrojs/preact']) {
    if (!finalConfig.optimizeDeps.exclude.includes(pkg)) {
      finalConfig.optimizeDeps.exclude.push(pkg);
    }
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
  // Mark integration virtual modules as external so esbuild skips them
  // when it encounters them inside any package it does pre-bundle.
  if (!finalConfig.optimizeDeps.esbuildOptions) {
    finalConfig.optimizeDeps.esbuildOptions = {};
  }
  if (!finalConfig.optimizeDeps.esbuildOptions.external) {
    finalConfig.optimizeDeps.esbuildOptions.external = [];
  }
  const integrationVirtualModules = [
    // @astrojs/vue
    'virtual:@astrojs/vue/app',
    'virtual:astro:vue-app',
    // @astrojs/react and @astrojs/preact
    'astro:react:opts',
    'astro:preact:opts'
  ];

  for (const mod of integrationVirtualModules) {
    if (!finalConfig.optimizeDeps.esbuildOptions.external.includes(mod)) {
      finalConfig.optimizeDeps.esbuildOptions.external.push(mod);
    }
  }

  return finalConfig;
};
