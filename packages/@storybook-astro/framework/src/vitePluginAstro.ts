import { mergeConfig, type InlineConfig } from 'vite';
import type { Integration } from './integrations/index.ts';
import { importAstroConfig } from './importAstroConfig.ts';
import { loadUserAstroIntegrations } from './loadUserAstroConfig.ts';

const ASTRO_PLUGINS_THAT_ARE_SUPPOSEDLY_NOT_NEEDED_IN_STORYBOOK = [
  '@astro/plugin-actions',
  '@astrojs/vite-plugin-astro-ssr-manifest',
  'astro-content-virtual-mod-plugin',
  'astro:actions',
  'astro:build:normal',
  'astro:container',
  'astro:content-asset-propagation',
  'astro:content-imports',
  'astro:content-listen',
  'astro:dev-toolbar',
  'astro:head-metadata',
  'astro:html',
  'astro:i18n',
  'astro:integration-container',
  'astro:jsx',
  'astro:markdown',
  'astro:postprocess',
  'astro:prefetch',
  'astro:scanner',
  'astro:scripts:page-ssr',
  'astro:server',
  'astro:vite-plugin-env',
  'astro:vite-plugin-file-url'
];

export async function mergeWithAstroConfig(
  config: InlineConfig,
  integrations: Integration[] = [],
  resolveFrom = process.cwd(),
  mode = 'development',
  command: 'build' | 'serve' = 'serve'
) {
  const { getViteConfig } = await importAstroConfig(resolveFrom);
  const safeIntegrations = integrations ?? [];

  const frameworkIntegrations = await Promise.all(
    safeIntegrations.map((integration) => integration.loadIntegration(resolveFrom))
  );

  const userIntegrations = await loadUserAstroIntegrations(resolveFrom);
  const frameworkNames = new Set(frameworkIntegrations.map(i => i.name));
  const extraIntegrations = userIntegrations.filter(i => !frameworkNames.has(i.name));

  const astroConfig = await getViteConfig(
    {},
    {
      configFile: false,
      integrations: [...frameworkIntegrations, ...extraIntegrations]
    }
  )({
    mode,
    command
  });

  const filteredPlugins = astroConfig
    .plugins!.flat()
    .filter(
      (plugin) =>
        plugin &&
        'name' in plugin &&
        !ASTRO_PLUGINS_THAT_ARE_SUPPOSEDLY_NOT_NEEDED_IN_STORYBOOK.includes(plugin.name)
    );

  return mergeConfig(config, {
    ...astroConfig,
    plugins: filteredPlugins
  });
}
