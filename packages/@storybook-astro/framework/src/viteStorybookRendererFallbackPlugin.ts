import type { Integration } from './integrations/index.ts';
import { createVirtualModulePlugin } from './vite/createVirtualModulePlugin.ts';

export function viteStorybookRendererFallbackPlugin(integrations: Integration[]) {
  const safeIntegrations = integrations ?? [];

  return createVirtualModulePlugin({
    pluginName: 'storybook-renderer-fallback',
    virtualModuleId: 'virtual:storybook-renderer-fallback',
    load() {
      return safeIntegrations
        .filter((integration) => integration.storybookEntryPreview)
        .map(
          (integration) =>
            `export * as ${integration.name} from '${integration.storybookEntryPreview}';`
        )
        .join('\n');
    }
  });
}
