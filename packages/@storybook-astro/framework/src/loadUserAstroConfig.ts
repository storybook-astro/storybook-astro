import { loadConfigFromFile, type AliasOptions, type Plugin, type PluginOption } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AstroIntegration } from 'astro';
import type { StorybookFontFamily } from './vitePluginAstroFonts.ts';

const CONFIG_FILENAMES = [
  'astro.config.ts',
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.cjs',
];

interface UserAstroConfigData {
  integrations: AstroIntegration[];
  fonts: StorybookFontFamily[];
  vitePlugins: Plugin[];
  viteResolveAlias: AliasOptions | undefined;
}

const EMPTY: UserAstroConfigData = {
  integrations: [],
  fonts: [],
  vitePlugins: [],
  viteResolveAlias: undefined
};

// Cache by resolveFrom — config rarely changes during a Storybook session and
// several call sites read the same data.  Each entry stores the in-flight
// promise so concurrent callers share the same load.
const configCache = new Map<string, Promise<UserAstroConfigData>>();

// Config files that already produced a load failure warning.
const warnedConfigFiles = new Set<string>();

async function loadUserAstroConfigData(resolveFrom: string): Promise<UserAstroConfigData> {
  let cached = configCache.get(resolveFrom);

  if (!cached) {
    cached = readUserAstroConfig(resolveFrom);
    configCache.set(resolveFrom, cached);
  }

  return cached;
}

async function readUserAstroConfig(resolveFrom: string): Promise<UserAstroConfigData> {
  // Vite's loadConfigFromFile resolves a relative configFile against
  // process.cwd(), not the configRoot argument, so we always hand it an
  // absolute path to make the lookup deterministic regardless of where
  // Storybook is invoked from.
  const configFile = CONFIG_FILENAMES
    .map((name) => resolve(resolveFrom, name))
    .find((path) => existsSync(path));

  if (!configFile) {
    return EMPTY;
  }

  try {
    const result = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      configFile,
      resolveFrom
    );

    if (!result?.config) {
      return EMPTY;
    }

    const config = result.config as {
      integrations?: unknown;
      fonts?: unknown;
      vite?: { plugins?: unknown; resolve?: { alias?: unknown } };
    };

    return {
      integrations: extractIntegrations(config.integrations),
      fonts: extractFonts(config.fonts),
      vitePlugins: extractVitePlugins(config.vite?.plugins),
      viteResolveAlias: extractViteResolveAlias(config.vite?.resolve?.alias)
    };
  } catch (err) {
    // Vite plugins are read once per render pipeline (see
    // loadUserAstroVitePlugins), so a broken config would otherwise repeat
    // the same warning several times per session.
    if (!warnedConfigFiles.has(configFile)) {
      warnedConfigFiles.add(configFile);
      console.warn(
        '[storybook-astro] Could not load astro.config to discover integrations / fonts / vite plugins:',
        err instanceof Error ? err.message : String(err)
      );
    }

    return EMPTY;
  }
}

function extractIntegrations(raw: unknown): AstroIntegration[] {
  if (!raw) {
    return [];
  }

  // Astro allows nested arrays from conditional spreads (e.g. ...whenX(() => mdx()))
  const flat = (Array.isArray(raw) ? raw : [raw]).flat(Infinity);

  return flat.filter(
    (i): i is AstroIntegration =>
      Boolean(i) && typeof i === 'object' && 'name' in i && 'hooks' in i
  );
}

function extractFonts(raw: unknown): StorybookFontFamily[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (f): f is StorybookFontFamily =>
      Boolean(f) &&
      typeof f === 'object' &&
      typeof (f as { name?: unknown }).name === 'string' &&
      typeof (f as { cssVariable?: unknown }).cssVariable === 'string' &&
      typeof (f as { provider?: unknown }).provider === 'object'
  );
}

function extractViteResolveAlias(raw: unknown): AliasOptions | undefined {
  // Vite accepts an object map or an array of { find, replacement } entries —
  // pass either through untouched and reject everything else.
  if (Array.isArray(raw)) {
    return raw.length > 0 ? (raw as AliasOptions) : undefined;
  }

  if (raw && typeof raw === 'object') {
    return Object.keys(raw).length > 0 ? (raw as AliasOptions) : undefined;
  }

  return undefined;
}

function extractVitePlugins(raw: unknown): Plugin[] {
  if (!raw) {
    return [];
  }

  // vite.plugins accepts Plugin | Plugin[] | (Plugin | false | null | undefined)[][] etc.
  const flat = (Array.isArray(raw) ? raw : [raw]).flat(Infinity);

  return flat.filter(
    (p): p is Plugin =>
      Boolean(p) && typeof p === 'object' && 'name' in p && typeof (p as Plugin).name === 'string'
  );
}

/**
 * Loads integrations declared in the user's astro.config.* so that any Vite
 * plugins they register (e.g. astro-icon's virtual:astro-icon resolver) are
 * present in both the main Storybook Vite server and the internal Astro SSR
 * server.  Returns an empty array on any failure so the calling code can
 * continue with only the framework-level integrations.
 */
export async function loadUserAstroIntegrations(resolveFrom: string): Promise<AstroIntegration[]> {
  return (await loadUserAstroConfigData(resolveFrom)).integrations;
}

/**
 * Loads the `fonts:` array from the user's astro.config.* so the Astro 6
 * Font Provider API works in Storybook without duplicating the array into
 * `framework.options.fonts`.  Returns [] if the project has no fonts
 * configured or the config can't be read.
 */
export async function loadUserAstroFonts(resolveFrom: string): Promise<StorybookFontFamily[]> {
  return (await loadUserAstroConfigData(resolveFrom)).fonts;
}

/**
 * Loads raw Vite plugins declared at `vite.plugins` in the user's
 * astro.config.* (e.g. `@tailwindcss/vite`, `unocss/vite`).  These are not
 * registered through Astro's integration API so `loadUserAstroIntegrations`
 * does not pick them up; this loader fills the gap so CSS frameworks added
 * as raw Vite plugins work in Storybook without `viteFinal`.
 *
 * Deliberately skips the config cache: a Vite plugin is a stateful object
 * (it captures the resolved config in `configResolved`, caches in
 * `buildStart`) and every caller registers the result with a different Vite
 * instance — in dev the Storybook server and the internal SSR server are even
 * live at the same time.  Re-reading the config runs the config module again
 * and hands each pipeline its own instances.  Integrations and fonts are
 * plain data and keep using the cache.
 */
export async function loadUserAstroVitePlugins(resolveFrom: string): Promise<Plugin[]> {
  return (await readUserAstroConfig(resolveFrom)).vitePlugins;
}

/**
 * Appends user Vite plugins (from `loadUserAstroVitePlugins`) to a Vite
 * config, skipping any plugin whose name is already registered.  Every render
 * pipeline — the main Storybook build, the static prerender's SSR server, the
 * hydrated-island asset build and the dev-mode internal SSR server — must
 * receive these plugins, otherwise components that rely on one of them (e.g.
 * `vite-svg-loader`'s `.svg?component` imports) resolve differently between
 * pipelines.  Returns the plugins that were actually appended so callers can
 * log them.
 */
export function appendUserVitePlugins(
  config: { plugins?: PluginOption[] },
  userVitePlugins: Plugin[]
): Plugin[] {
  if (userVitePlugins.length === 0) {
    return [];
  }

  const existingNames = new Set<string>();

  for (const plugin of ((config.plugins ?? []) as unknown[]).flat(Infinity) as Array<{
    name?: string;
  }>) {
    if (plugin && typeof plugin === 'object' && typeof plugin.name === 'string') {
      existingNames.add(plugin.name);
    }
  }

  const newPlugins = userVitePlugins.filter((plugin) => !existingNames.has(plugin.name));

  if (newPlugins.length > 0) {
    config.plugins = [...(config.plugins ?? []), ...newPlugins];
  }

  return newPlugins;
}

/**
 * Loads `vite.resolve.alias` from the user's astro.config.* so alias-based
 * module resolution also works in the story SSR server, which is built with
 * `configFile: false` and would otherwise silently drop it (issue #136).
 */
export async function loadUserAstroViteResolveAlias(
  resolveFrom: string
): Promise<AliasOptions | undefined> {
  return (await loadUserAstroConfigData(resolveFrom)).viteResolveAlias;
}

/**
 * Combines the framework's own integrations with those declared in the
 * user's astro.config.*, dropping user duplicates by name. Shared by the dev
 * SSR server and the production render runtime so both load the same set —
 * previously only dev did, leaving server-mode renders without user
 * integrations.
 */
export async function mergeFrameworkAndUserIntegrations(
  frameworkIntegrations: AstroIntegration[],
  resolveFrom: string
): Promise<AstroIntegration[]> {
  const userIntegrations = await loadUserAstroIntegrations(resolveFrom);
  const frameworkNames = new Set(frameworkIntegrations.map((integration) => integration.name));

  return [
    ...frameworkIntegrations,
    ...userIntegrations.filter((integration) => !frameworkNames.has(integration.name))
  ];
}
