import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

/** A processed `<script>` as Astro's compiler reports it: inline code or an external `src`. */
type HoistedScript = { type: string; code?: string; src?: string };

type AstroCompiler = {
  transform: (
    source: string,
    options: { filename: string; renderScript: boolean }
  ) => { scripts: HoistedScript[] } | Promise<{ scripts: HoistedScript[] }>;
};

/**
 * Reads the processed `<script>`s of the given Astro components and returns
 * each one's module source, keyed by the id Astro renders it with:
 * `<component path>?astro&type=script&index=<n>&lang.ts`.
 *
 * Prerendering leaves every such script as `<script type="module" src="<id>">`,
 * a URL only a dev server can answer. Bundling the scripts under those same ids
 * lets the static build point each `src` at a built chunk.
 */
export async function collectComponentScripts(
  astroFilePaths: Iterable<string>,
  resolveFrom: string
): Promise<Map<string, string>> {
  const compiler = await importAstroCompiler(resolveFrom);
  const scripts = new Map<string, string>();

  for (const astroFilePath of astroFilePaths) {
    // Vite renders the component from its real path, so the ids must use it too.
    const filename = (await realpath(astroFilePath)).replace(/\\/g, '/');
    // Astro 5 compiles with `renderScript: true`; without it the compiler skips
    // scripts inside expressions and the indices drift from the rendered ids.
    // Astro 6 and 7 always behave this way and ignore the option.
    const { scripts: hoistedScripts } = await compiler.transform(
      await readFile(astroFilePath, 'utf-8'),
      { filename, renderScript: true }
    );

    hoistedScripts.forEach((script, index) => {
      // The same module Astro's own Vite plugin serves for this id.
      const code =
        script.type === 'external' ? `import ${JSON.stringify(script.src)};` : (script.code ?? '');

      scripts.set(`${filename}?astro&type=script&index=${index}&lang.ts`, code);
    });
  }

  return scripts;
}

/**
 * Serves the collected scripts to a build. Each module keeps its component's
 * path, so relative imports inside a script resolve as they do in Astro.
 */
export function vitePluginComponentScripts(scripts: Map<string, string>): Plugin {
  return {
    name: 'storybook-astro:component-scripts',
    // Ahead of Astro's own plugin, which can only serve these ids after it has
    // compiled the component for the server — something this build never does.
    enforce: 'pre',

    resolveId(id: string) {
      return scripts.has(id) ? id : undefined;
    },

    load(id: string) {
      const code = scripts.get(id);

      // Rolldown (Vite 8) takes the language from `moduleType`, as Astro sets it.
      return code === undefined ? undefined : { code, moduleType: 'ts' };
    }
  };
}

/**
 * Imports the compiler the project's `astro` compiles components with —
 * `@astrojs/compiler-rs` on Astro 7, `@astrojs/compiler` on Astro 5 and 6 — so
 * the script indices match the ones in the prerendered HTML.
 */
async function importAstroCompiler(resolveFrom: string): Promise<AstroCompiler> {
  const require = createRequire(import.meta.url);
  const astroPackageJsonPath = require.resolve('astro/package.json', { paths: [resolveFrom] });
  const astroDependencies: Record<string, string> =
    require(astroPackageJsonPath).dependencies ?? {};
  const compilerName =
    '@astrojs/compiler-rs' in astroDependencies ? '@astrojs/compiler-rs' : '@astrojs/compiler';
  const compilerEntrypoint = createRequire(astroPackageJsonPath).resolve(compilerName);

  return import(/* @vite-ignore */ pathToFileURL(compilerEntrypoint).href);
}
