import type { Plugin } from 'vite';
import type { TsconfigCache } from 'get-tsconfig';
import { resolveTsconfigAliasedImport } from './lib/resolve-aliased-island.ts';

/**
 * Resolves tsconfig path aliases (e.g. `~/styles/tokens`) in the story SSR
 * module graph (issue #136). Astro's own `astro:tsconfig-alias` plugin runs as
 * a later fallback, but it is not applied consistently across the render
 * server's `configFile: false` setups — this plugin guarantees aliased imports
 * inside `.astro`/`.tsx` components resolve against the nearest tsconfig,
 * both in the user's repo and inside the deployed `storybook-server/project`
 * snapshot (whose tsconfig is copied by the snapshot builder).
 */
export function vitePluginTsconfigAliases(resolveFrom: string): Plugin {
  // getTsconfig re-reads and re-merges tsconfig files per call; renders touch
  // many modules, so share one cache per server instance.
  const tsconfigCache: TsconfigCache = new Map();

  return {
    name: 'storybook-astro:tsconfig-aliases',
    async resolveId(id, importer) {
      // Fast bails — the resolver skips these too, but most ids never need
      // the tsconfig lookup at all.
      if (!id || id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) {
        return null;
      }

      // Virtual importers have no directory to walk up from.
      const searchFrom =
        importer && !importer.startsWith('\0') ? importer.replace(/\?.*$/, '') : resolveFrom;

      const resolved = await resolveTsconfigAliasedImport(id, searchFrom, tsconfigCache);

      return resolved ?? null;
    }
  };
}
