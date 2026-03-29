import type { PluginOption } from 'vite';
import { describe, expect, test } from 'vitest';
import {
  STORYBOOK_ASTRO_SERVER_AUTH_CONFIG_VIRTUAL_MODULE_ID,
  storybookAstroServerAuthConfigVirtualModulePlugin
} from './storybookAstroServerAuthConfigVirtualModulePlugin.ts';

function getPlugin(pluginOption: PluginOption) {
  if (Array.isArray(pluginOption)) {
    throw new Error('Expected a single plugin object, but got a plugin array.');
  }

  if (!pluginOption || typeof pluginOption !== 'object') {
    throw new Error('Expected plugin option to be an object.');
  }

  return pluginOption;
}

function getHookHandler<T extends (...args: unknown[]) => unknown>(hook: unknown): T {
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

describe('storybookAstroServerAuthConfigVirtualModulePlugin', () => {
  test('normalizes auth token and header values', async () => {
    const plugin = getPlugin(
      storybookAstroServerAuthConfigVirtualModulePlugin({
        authToken: '  test-token  ',
        authHeader: '  X-Storybook-Token  '
      })
    );
    const resolveId = getHookHandler<(id: string) => string | undefined>(plugin.resolveId);
    const load = getHookHandler<(id: string) => Promise<string | undefined>>(plugin.load);
    const resolvedId = resolveId(STORYBOOK_ASTRO_SERVER_AUTH_CONFIG_VIRTUAL_MODULE_ID);

    expect(resolvedId).toBe(`\0${STORYBOOK_ASTRO_SERVER_AUTH_CONFIG_VIRTUAL_MODULE_ID}`);
    await expect(load(resolvedId!)).resolves.toBe(
      'export const storybookAstroServerAuthToken = "test-token";\n' +
        'export const storybookAstroServerAuthHeader = "x-storybook-token";'
    );
  });

  test('falls back to authorization header and undefined token', async () => {
    const plugin = getPlugin(
      storybookAstroServerAuthConfigVirtualModulePlugin({
        authToken: '   '
      })
    );
    const load = getHookHandler<(id: string) => Promise<string | undefined>>(plugin.load);

    await expect(
      load(`\0${STORYBOOK_ASTRO_SERVER_AUTH_CONFIG_VIRTUAL_MODULE_ID}`)
    ).resolves.toBe(
      'export const storybookAstroServerAuthToken = undefined;\n' +
        'export const storybookAstroServerAuthHeader = "authorization";'
    );
  });
});
