import type { Integration } from './base.ts';
import type { Options as VueOptions } from '@vitejs/plugin-vue';
import type { Options as VueJsxOptions } from '@vitejs/plugin-vue-jsx';
import { importModule } from './moduleResolver.ts';

export type Options = Pick<VueOptions, 'include' | 'exclude'> & {
  jsx?: boolean | VueJsxOptions;
};

const DEFAULT_OPTIONS: Options = {
  include: ['**/*.vue']
};

export class VueIntegration implements Integration {
  readonly name = 'vue';
  readonly dependencies = ['@astrojs/vue', '@storybook/vue3', 'vue'];
  readonly options: Options;
  readonly storybookEntryPreview = '@storybook/vue3/entry-preview';

  readonly renderer = {
    server: {
      name: '@astrojs/vue',
      entrypoint: '@astrojs/vue/server.js'
    },
    client: {
      name: '@astrojs/vue',
      entrypoint: '@astrojs/vue/client.js'
    }
  };

  constructor(options: Options = DEFAULT_OPTIONS) {
    this.options = options;
  }

  resolveClient(moduleName: string): string | undefined {
    if (moduleName.startsWith('@astrojs/vue/client')) {
      return `/@id/${moduleName}`;
    }
  }

  async loadIntegration(resolveFrom = process.cwd()) {
    const framework = await importModule<{
      default: (options: Options) => Awaited<ReturnType<Integration['loadIntegration']>>;
    }>('@astrojs/vue', resolveFrom);

    return framework.default(this.options);
  }
}
