import type { Plugin } from 'vite';
import type { ServerBuildOptions } from '../types.ts';
import { createVirtualModulePlugin } from './createVirtualModulePlugin.ts';

export const STORYBOOK_ASTRO_SERVER_AUTH_CONFIG_VIRTUAL_MODULE_ID =
  'virtual:storybook-astro-server-auth-config';

export function storybookAstroServerAuthConfigVirtualModulePlugin(
  options?: ServerBuildOptions
): Plugin {
  const authToken = normalizeOptionalString(options?.authToken);
  const authHeader = normalizeAuthHeader(options?.authHeader);

  return createVirtualModulePlugin({
    pluginName: 'storybook-astro:virtual-server-auth-config',
    virtualModuleId: STORYBOOK_ASTRO_SERVER_AUTH_CONFIG_VIRTUAL_MODULE_ID,
    load() {
      return [
        `export const storybookAstroServerAuthToken = ${
          authToken ? JSON.stringify(authToken) : 'undefined'
        };`,
        `export const storybookAstroServerAuthHeader = ${JSON.stringify(authHeader)};`
      ].join('\n');
    }
  });
}

function normalizeOptionalString(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue || undefined;
}

function normalizeAuthHeader(value: string | undefined) {
  const normalizedValue = normalizeOptionalString(value);

  return (normalizedValue ?? 'authorization').toLowerCase();
}
