import { loadConfigFromFile } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AstroIntegration } from 'astro';

const CONFIG_FILENAMES = [
  'astro.config.ts',
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.cjs',
];

/**
 * Loads integrations declared in the user's astro.config.* so that any Vite
 * plugins they register (e.g. astro-icon's virtual:astro-icon resolver) are
 * present in both the main Storybook Vite server and the internal Astro SSR
 * server.  Returns an empty array on any failure so the calling code can
 * continue with only the framework-level integrations.
 */
export async function loadUserAstroIntegrations(resolveFrom: string): Promise<AstroIntegration[]> {
  const configFile = CONFIG_FILENAMES.find(name => existsSync(resolve(resolveFrom, name)));

  if (!configFile) {
    return [];
  }

  try {
    const result = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      configFile,
      resolveFrom
    );

    if (!result?.config) {
      return [];
    }

    const config = result.config as { integrations?: unknown };
    const raw = config.integrations;

    if (!raw) {
      return [];
    }

    // Astro allows nested arrays from conditional spreads (e.g. ...whenX(() => mdx()))
    const flat = (Array.isArray(raw) ? raw : [raw]).flat(Infinity);

    return flat.filter(
      (i): i is AstroIntegration => Boolean(i) && typeof i === 'object' && 'name' in i && 'hooks' in i
    );
  } catch (err) {
    console.warn(
      '[storybook-astro] Could not load astro.config to discover integrations:',
      err instanceof Error ? err.message : String(err)
    );

    return [];
  }
}
