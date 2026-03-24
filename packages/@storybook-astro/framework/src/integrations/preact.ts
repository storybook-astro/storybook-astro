import type { Integration } from './base.ts';
import type { PreactPluginOptions } from '@preact/preset-vite';
import { importModule } from './moduleResolver.ts';

export type Options = Pick<PreactPluginOptions, 'include' | 'exclude'> & {
  compat?: boolean;
  devtools?: boolean;
};

export class PreactIntegration implements Integration {
  readonly name = 'preact';
  readonly dependencies = ['@astrojs/preact', '@storybook/preact-vite', 'preact'];
  readonly options: Options;
  readonly storybookEntryPreview = '@storybook/preact/entry-preview';
  
  readonly renderer = {
    server: {
      name: '@astrojs/preact',
      entrypoint: '@astrojs/preact/server.js'
    },
    client: {
      name: '@astrojs/preact',
      entrypoint: '@astrojs/preact/client.js'
    }
  };

  constructor(options: Options = {}) {
    this.options = options;
  }

  resolveClient(moduleName: string): string | undefined {
    if (moduleName.startsWith('@astrojs/preact/client')) {
      return `/@id/${moduleName}`;
    }
  }

  async loadIntegration(resolveFrom = process.cwd()) {
    const framework = await importModule<{
      default: (options: Options) => Awaited<ReturnType<Integration['loadIntegration']>>;
    }>('@astrojs/preact', resolveFrom);

    return framework.default(this.options);
  }
}
