import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { basename, dirname, join } from 'node:path';
import type { InlineConfig, Plugin } from 'vite';

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

/** How the compiled render server must be bundled to run on workerd. */
export function createWorkerViteConfig(): InlineConfig {
  return {
    ssr: {
      target: 'webworker',
      resolve: {
        conditions: ['workerd', 'worker', 'module', 'import', 'default'],
        externalConditions: ['workerd', 'worker']
      }
    },
    build: {
      rollupOptions: {
        // Provided by the runtime under the `nodejs_compat` flag.
        external: (id) => nodeBuiltins.has(id) || id.startsWith('cloudflare:')
      }
    },
    plugins: [wasmModulesPlugin(), importMetaUrlPlugin(), astroWorkerdShimsPlugin()]
  };
}

/** Workers load `.wasm` as separate compiled modules, so emit them next to the bundle. */
function wasmModulesPlugin(): Plugin {
  const wasmFiles = new Map<string, string>();

  return {
    name: 'storybook-astro-cloudflare:wasm-modules',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (!id.endsWith('.wasm') || !importer) {
        return null;
      }

      const resolved = await this.resolve(id, importer, { skipSelf: true });
      const filePath = resolved?.id ?? join(dirname(importer), id);
      const fileName = basename(filePath);

      wasmFiles.set(fileName, filePath);

      return { id: `./${fileName}`, external: true };
    },
    async generateBundle() {
      for (const [fileName, filePath] of wasmFiles) {
        this.emitFile({ type: 'asset', fileName, source: await readFile(filePath) });
      }
    }
  };
}

/** workerd leaves `import.meta.url` undefined, but Astro builds its default URLs from it. */
function importMetaUrlPlugin(): Plugin {
  return {
    name: 'storybook-astro-cloudflare:import-meta-url',
    renderChunk(code) {
      return code.replaceAll('import.meta.url', '"file:///worker.js"');
    }
  };
}

/**
 * Astro packages that branch on the `workerd` condition expect virtual modules
 * from Astro's own Cloudflare adapter, and markdown-remark's plugin loader
 * uses `createRequire`. Stories render no Markdown, so give both their
 * runtime-free variants.
 */
function astroWorkerdShimsPlugin(): Plugin {
  const prismLanguagesId = 'virtual:astro-cloudflare:prism';

  return {
    name: 'storybook-astro-cloudflare:astro-workerd-shims',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === prismLanguagesId) {
        return `\0${prismLanguagesId}`;
      }

      if (id === '#import-plugin' && importer?.includes('markdown-remark')) {
        return join(dirname(importer), 'import-plugin-browser.js');
      }

      return null;
    },
    load(id) {
      return id === `\0${prismLanguagesId}` ? 'export const bundledLanguages = {};' : null;
    }
  };
}
