import type { Integration } from './base.ts';
import { importModule } from './moduleResolver.ts';

export type Options = Record<string, unknown>;

export class AlpineIntegration implements Integration {
  readonly name = 'alpine';
  readonly factoryName = 'alpinejs';
  readonly dependencies = [
    '@astrojs/alpinejs',
    'alpinejs'
  ];
  readonly options: Options;
  readonly renderer = {};

  constructor(options: Options = {}) {
    this.options = options;
  }

  resolveClient(_moduleName: string): undefined {}

  async loadIntegration(resolveFrom = process.cwd()) {
    const framework = await importModule<{
      default: (options: Options) => Awaited<ReturnType<Integration['loadIntegration']>>;
    }>('@astrojs/alpinejs', resolveFrom);

    return framework.default(this.options);
  }
}
