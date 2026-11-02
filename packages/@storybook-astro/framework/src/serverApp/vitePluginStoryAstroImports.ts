import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Plugin } from 'vite';

/** Every `.astro` component a module reaches, keyed by module id. */
export type StoryAstroImports = Record<string, string[]>;

/**
 * Records, during the Storybook build, which `.astro` components every module
 * reaches through its imports. The server build reads it to give each story
 * file a render page that imports exactly the components its stories use,
 * including ones a story only passes as a slot or a decorator.
 *
 * Vite has already resolved every import here (aliases, packages, tsconfig
 * paths), so nothing is parsed by hand.
 */
export function vitePluginStoryAstroImports(outFile: string): Plugin {
  return {
    name: 'storybook-astro:story-astro-imports',
    apply: 'build',
    async generateBundle() {
      const reachable = new Map<string, Set<string>>();

      // The client build stubs `.astro` files, so their own imports are
      // server-side only; the walk stops at them. Packages may ship `.astro`
      // files, but their other modules don't lead to the project's components.
      // A module's set is stored before its imports are walked, which also
      // ends import cycles (a module in a cycle may miss its cycle peers').
      const collect = (moduleId: string): Set<string> => {
        const known = reachable.get(moduleId);

        if (known) {
          return known;
        }

        const components = new Set<string>();

        reachable.set(moduleId, components);

        if (moduleId.includes('/node_modules/')) {
          return components;
        }

        const info = this.getModuleInfo(moduleId);

        for (const importedId of [...(info?.importedIds ?? []), ...(info?.dynamicallyImportedIds ?? [])]) {
          const path = importedId.split('?')[0];

          if (path.endsWith('.astro')) {
            components.add(path);
          } else {
            collect(importedId).forEach((component) => components.add(component));
          }
        }

        return components;
      };

      const imports: StoryAstroImports = {};

      for (const moduleId of this.getModuleIds()) {
        if (moduleId.startsWith('\0') || moduleId.endsWith('.astro')) {
          continue;
        }

        const components = collect(moduleId);

        if (components.size > 0) {
          imports[moduleId.split('?')[0]] = [...components];
        }
      }

      await mkdir(dirname(outFile), { recursive: true });
      await writeFile(outFile, JSON.stringify(imports, null, 2));
    }
  };
}
