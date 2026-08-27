import type { Integration } from './base.ts';
import type { Options as ViteReactPluginOptions } from '@vitejs/plugin-react';
import { importModule } from './moduleResolver.ts';

export type Options = Pick<ViteReactPluginOptions, 'include' | 'exclude'>;

export class ReactIntegration implements Integration {
  readonly name = 'react';
  readonly dependencies = ['@astrojs/react', '@storybook/react', 'react', 'react-dom'];
  readonly options: Options;
  readonly storybookEntryPreview = '@storybook/react/entry-preview';
  readonly clientOptimizeDeps = ['react-dom/test-utils'];

  readonly renderer = {
    server: {
      name: '@astrojs/react',
      entrypoint: '@astrojs/react/server.js'
    },
    client: {
      name: '@astrojs/react',
      entrypoint: '@astrojs/react/client.js'
    }
  };

  constructor(options: Options = {}) {
    this.options = options;
  }

  resolveClient(moduleName: string): string | undefined {
    if (moduleName.startsWith('@astrojs/react/client')) {
      return `/@id/${moduleName}`;
    }
  }

  async loadIntegration(resolveFrom = process.cwd()) {
    const framework = await importModule<{
      default: (options: Options) => Awaited<ReturnType<Integration['loadIntegration']>>;
    }>('@astrojs/react', resolveFrom);

    return framework.default(this.options);
  }
}
