import type { RenderMode, ServerBuildOptions } from './types.ts';
import { createVirtualModulePlugin } from './vite/createVirtualModulePlugin.ts';

const packageName = '@storybook-astro/framework';

export function viteStorybookAstroRendererPlugin(options: {
  mode: 'development' | 'production';
  renderMode?: RenderMode;
  server?: ServerBuildOptions;
}) {
  const pluginName = 'storybook-astro:renderer-module';
  const virtualModuleId = 'virtual:storybook-astro-renderer';
  const isProduction = options.mode === 'production';
  const isStaticMode = options.renderMode === 'static';

  return createVirtualModulePlugin({
    pluginName,
    virtualModuleId,
    load() {
      if (!isProduction) {
        return `export * from '${packageName}/renderer/renderer-dev.ts';`;
      }

      if (isStaticMode) {
        return `export * from '${packageName}/renderer/renderer-static.ts';`;
      }

      return [
        `import { createServerRenderer } from '${packageName}/renderer/renderer-server.ts';`,
        `const renderer = createServerRenderer(${JSON.stringify(
          {
            serverUrl: options.server?.serverUrl,
            authToken: options.server?.authToken,
            authHeader: options.server?.authHeader
          },
          null,
          2
        )});`,
        'export const render = renderer.render;',
        'export const init = renderer.init;',
        'export const applyStyles = renderer.applyStyles;'
      ].join('\n');
    }
  });
}
