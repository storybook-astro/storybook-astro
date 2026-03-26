import type { PluginOption } from 'vite';
import {
  loadStoryInlineModule,
  resolveStoryModuleMock,
  STORYBOOK_ASTRO_INLINE_MODULE_PREFIX
} from './module-mocks.ts';

export function vitePluginStoryModuleMocks(): PluginOption {
  return {
    name: 'storybook-astro:story-module-mocks',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith(STORYBOOK_ASTRO_INLINE_MODULE_PREFIX)) {
        return `\0${id}`;
      }

      const mockedModule = resolveStoryModuleMock(id);

      if (mockedModule) {
        return mockedModule;
      }

      return null;
    },
    load(id) {
      return loadStoryInlineModule(id);
    }
  } satisfies PluginOption;
}
