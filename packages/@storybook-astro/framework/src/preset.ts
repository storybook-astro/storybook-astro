import type { StorybookConfigVite, FrameworkOptions } from './types.ts';
import { vitePluginStorybookAstroMiddleware } from './viteStorybookAstroMiddlewarePlugin.ts';
import { viteStorybookRendererFallbackPlugin } from './viteStorybookRendererFallbackPlugin.ts';
import { vitePluginAstroComponentMarker } from './vitePluginAstroComponentMarker.ts';
import { vitePluginAstroBuildPrerender } from './vitePluginAstroBuildPrerender.ts';
import { vitePluginAstroVueFallback } from './vitePluginAstroVueFallback.ts';
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
