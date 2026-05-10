import type { Plugin } from 'vite';
import type { SanitizationOptions } from '../lib/sanitization.ts';
import { serializeSanitizationOptions } from '../lib/sanitization.ts';
import { createVirtualModule } from './virtualModulePlugin.ts';

export const SANITIZE_CONFIG_MODULE_ID = 'virtual:storybook-astro/sanitize-config';

export function sanitizeConfigPlugin(options?: SanitizationOptions): Plugin {
  return createVirtualModule({
    pluginName: 'storybook-astro:sanitize-config',
    virtualModuleId: SANITIZE_CONFIG_MODULE_ID,
    load() {
      const serializedConfig = serializeSanitizationOptions(options);

      return `export default ${serializedConfig};`;
    }
  });
}
