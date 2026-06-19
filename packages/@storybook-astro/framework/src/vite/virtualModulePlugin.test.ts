import type { Plugin, PluginOption } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import { createVirtualModule } from './virtualModulePlugin.ts';

function getPlugin(pluginOption: PluginOption): Plugin {
  if (Array.isArray(pluginOption)) {
    throw new Error('Expected a single plugin object, but got a plugin array.');
  }

  if (!pluginOption || typeof pluginOption !== 'object') {
    throw new Error('Expected plugin option to be an object.');
  }

  return pluginOption as Plugin;
}

function getHookHandler<T>(hook: unknown): T {
  if (typeof hook === 'function') {
    return hook as T;
  }

  if (
    typeof hook === 'object' &&
    hook !== null &&
    'handler' in hook &&
    typeof (hook as { handler?: unknown }).handler === 'function'
  ) {
    return (hook as { handler: T }).handler;
  }

  throw new Error('Expected hook to be a function or an object with a handler function.');
}

describe('createVirtualModule', () => {
  test('resolves configured virtual module id with a null-byte prefix', () => {
    const pluginOption = createVirtualModule({
      pluginName: 'test:virtual-module',
      virtualModuleId: 'virtual:test-module',
      load: () => 'export default true;'
    });
    const plugin = getPlugin(pluginOption);
    const resolveId = getHookHandler<(id: string) => string | undefined>(plugin.resolveId);

    expect(plugin.name).toBe('test:virtual-module');
    expect(resolveId('virtual:test-module')).toBe('\0virtual:test-module');
    expect(resolveId('virtual:other-module')).toBeUndefined();
  });

  test('loads module content only for the resolved virtual module id', async () => {
    const load = vi.fn(() => 'export const message = "hello";');
    const pluginOption = createVirtualModule({
      pluginName: 'test:virtual-module',
      virtualModuleId: 'virtual:test-module',
      load
    });
    const plugin = getPlugin(pluginOption);
    const loadModule = getHookHandler<(id: string) => Promise<string | undefined>>(plugin.load);

    const result = await loadModule('\0virtual:test-module');

    expect(result).toBe('export const message = "hello";');
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('\0virtual:test-module');

    await expect(loadModule('virtual:test-module')).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('supports asynchronous virtual module loaders', async () => {
    const pluginOption = createVirtualModule({
      pluginName: 'test:virtual-module',
      virtualModuleId: 'virtual:test-module',
      load: async () => 'export default "async";'
    });
    const plugin = getPlugin(pluginOption);
    const loadModule = getHookHandler<(id: string) => Promise<string | undefined>>(plugin.load);

    await expect(loadModule('\0virtual:test-module')).resolves.toBe('export default "async";');
  });
});
