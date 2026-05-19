import type { Integration } from './integrations/index.ts';
import { createVirtualModule } from './vite/virtualModulePlugin.ts';

export function viteStorybookRendererFallbackPlugin(integrations: Integration[]) {
  const safeIntegrations = integrations ?? [];

  return createVirtualModule({
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
