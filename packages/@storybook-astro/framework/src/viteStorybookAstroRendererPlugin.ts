import { fileURLToPath } from 'node:url';
import type { RenderMode, ServerBuildOptions } from './types.ts';
import { createVirtualModule } from './vite/virtualModulePlugin.ts';

const rendererDevModulePath = fileURLToPath(new URL('./renderer/renderer-dev.js', import.meta.url));
const rendererStaticModulePath = fileURLToPath(new URL('./renderer/renderer-static.js', import.meta.url));
const rendererServerModulePath = fileURLToPath(new URL('./renderer/renderer-server.js', import.meta.url));

export function viteStorybookAstroRendererPlugin(options: {
  mode: 'development' | 'production';
  renderMode?: RenderMode;
  server?: ServerBuildOptions;
}) {
  const pluginName = 'storybook-astro:renderer-module';
  const virtualModuleId = 'virtual:storybook-astro-renderer';
  const isProduction = options.mode === 'production';
  const isStaticMode = options.renderMode === 'static';

  return createVirtualModule({
    pluginName,
    virtualModuleId,
    load() {
      if (!isProduction) {
        return `export * from ${JSON.stringify(normalizePath(rendererDevModulePath))};`;
      }

      if (isStaticMode) {
        return `export * from ${JSON.stringify(normalizePath(rendererStaticModulePath))};`;
      }

      return [
        `import { createServerRenderer } from ${JSON.stringify(normalizePath(rendererServerModulePath))};`,
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

function normalizePath(value: string) {
  return value.replace(/\\/g, '/');
}
