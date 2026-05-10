import type { Integration } from './integrations/index.ts';
import { createVirtualModule } from './vite/virtualModulePlugin.ts';

type PluginOptions = {
  mode?: 'development' | 'production';
  staticModuleMap?: Record<string, string>;
};

export function viteAstroContainerRenderersPlugin(
  integrations: Integration[],
  options: PluginOptions = {}
) {
  const safeIntegrations = integrations ?? [];
  const mode = options.mode ?? 'development';
  const staticModuleMap = options.staticModuleMap ?? {};

  return createVirtualModule({
    pluginName: 'storybook-astro:container-renderers',
    virtualModuleId: 'virtual:astro-container-renderers',
    load() {
      const importStatements = buildImportStatements(safeIntegrations);
      const clientResolvers =
        mode === 'development'
          ? safeIntegrations
              .filter((integration) => typeof integration.resolveClient === 'function')
              .map((integration) =>
                integration.resolveClient.toString().replace(/^resolveClient/, 'function')
              )
              .join(',\n')
          : '';

      return `
        ${importStatements}

        export function addRenderers(container) {
          ${safeIntegrations.map((integration) => buildServerRenderer(integration) + '\n' + buildClientRenderer(integration)).join('\n')}
        }

        const staticClientModules = ${JSON.stringify(staticModuleMap, null, 2)};

        const clientModulesResolvers = [
          ${clientResolvers}
        ];

        export function resolveClientModules(specifier) {
          if (Object.hasOwn(staticClientModules, specifier)) {
            return staticClientModules[specifier];
          }

          const normalizedSpecifier = specifier.replace(/\\\\/g, '/').replace(/\\?.*$/, '');

          if (Object.hasOwn(staticClientModules, normalizedSpecifier)) {
            return staticClientModules[normalizedSpecifier];
          }

          for (const resolver of clientModulesResolvers) {
            const resolution = resolver(specifier);

            if (resolution) {
              return resolution;
            }
          }
        }
      `;
    }
  });
}

function buildImportStatements(integrations: Integration[]) {
  return integrations
    .filter((integration) => integration.renderer.server)
    .map(
      (integration) =>
        `import ${integration.name}Renderer from '${integration.renderer.server?.entrypoint}';`
    )
    .join('\n');
}

function buildServerRenderer(integration: Integration) {
  const serverRenderer = integration.renderer.server;

  if (!serverRenderer) {
    return '';
  }

  if (integration.name === 'solid') {
    return `
      container.addServerRenderer({
        name: '${serverRenderer.name}',
        renderer: {
          ...${integration.name}Renderer,
          name: '${serverRenderer.name}'
        }
      });
    `;
  }

  return `
    container.addServerRenderer({
      name: '${serverRenderer.name}',
      renderer: ${integration.name}Renderer
    });
  `;
}

function buildClientRenderer(integration: Integration) {
  const clientRenderer = integration.renderer.client;

  if (clientRenderer) {
    return `
      container.addClientRenderer({
        name: '${clientRenderer.name}',
        entrypoint: '${clientRenderer.entrypoint}'
      });
    `;
  }

  return '';
}
