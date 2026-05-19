import type { Plugin } from 'vite';
import type { ServerBuildOptions } from '../types.ts';
import { createVirtualModule } from './virtualModulePlugin.ts';

export const SERVER_AUTH_MODULE_ID = 'virtual:storybook-astro/server-auth';

export function serverAuthPlugin(options?: ServerBuildOptions): Plugin {
  const authToken = normalizeOptionalString(options?.authToken);
  const authHeader = normalizeAuthHeader(options?.authHeader);

  return createVirtualModule({
    pluginName: 'storybook-astro:server-auth',
    virtualModuleId: SERVER_AUTH_MODULE_ID,
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
