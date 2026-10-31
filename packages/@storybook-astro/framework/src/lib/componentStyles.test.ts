import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadComponentStyles } from './componentStyles.ts';
import { vitePluginCompiledStylesheets } from './compiledStylesheets.ts';

// A fake SSR module graph: each module lists the ids it imports. Like Vite's,
// a file lookup returns every module for the file, sub-modules included. The
// server compiles every stylesheet in the graph through the real
// `vitePluginCompiledStylesheets`, each to a CSS comment naming it, so tests
// can assert on exactly which ones shipped.

type FakeModule = {
  id: string;
  url: string;
  importedModules: Set<FakeModule>;
  transformResult?: { dynamicDeps: string[] };
  /** Set once the server has run the module. */
  ssrModule?: object;
  /** Set when running the module threw. */
  ssrError?: Error;
};

const styleOf = (component: string, index = 0) =>
  `${component}?astro&type=style&index=${index}&lang.css`;

function createFakeServer(options: {
  imports: Record<string, string[]>;
  /** Imports each module loads with a dynamic `import()`, by the importer's id. */
  dynamicImports?: Record<string, string[]>;
  /**
   * Dynamic import targets no render has called yet. Vite has a node for each
   * but hasn't compiled it, so its imports (from `imports`) and their CSS only
   * appear once the server loads it.
   */
  notLoaded?: string[];
  /**
   * Dynamic import targets (also in `notLoaded`) that compile but throw when
   * the server runs them, such as a component importing a browser-only library.
   */
  failToLoad?: string[];
  /** Modules reachable only by URL, the way Vite registers a file outside the root. */
  urlOnly?: Record<string, string>;
  /** Style sub-modules still in the graph after their `<style>` block was deleted. */
  stale?: string[];
  /** Stylesheets the server never compiled, such as a block that failed to. */
  notCompiled?: string[];
  /** Compiled CSS for particular stylesheets, keyed by their id. */
  css?: Record<string, string>;
  /** Stylesheets whose compile throws, such as a Sass file with a syntax error. */
  failToCompile?: string[];
  /** URLs whose lookup rejects. */
  rejectUrl?: string[];
}) {
  const css = { ...options.css };
  const modules = new Map<string, FakeModule>();
  const moduleFor = (id: string): FakeModule => {
    if (!modules.has(id)) {
      modules.set(id, {
        id,
        url: id,
        importedModules: new Set(),
        transformResult: { dynamicDeps: [] },
        ssrModule: {}
      });
    }

    return modules.get(id)!;
  };

  for (const [id, imported] of Object.entries(options.imports)) {
    imported.forEach((importedId) => moduleFor(id).importedModules.add(moduleFor(importedId)));
  }

  for (const [id, imported] of Object.entries(options.dynamicImports ?? {})) {
    imported.forEach((importedId) => moduleFor(id).importedModules.add(moduleFor(importedId)));
    moduleFor(id).transformResult = { dynamicDeps: imported };
  }

  const notLoaded = new Set(options.notLoaded);
  const notLoadedImports = new Set<string>();

  for (const id of notLoaded) {
    const module = moduleFor(id);

    module.importedModules.forEach((imported) => notLoadedImports.add(imported.id));
    module.importedModules = new Set();
    module.transformResult = undefined;
    module.ssrModule = undefined;
  }

  (options.stale ?? []).forEach(moduleFor);

  const urlOnly = options.urlOnly ?? {};
  const modulesForFile = (file: string) =>
    [...modules.values()].filter((module) => module.id.split('?')[0] === file);

  const moduleGraph = {
    getModulesByFile: (file: string) =>
      modules.has(file) && !Object.values(urlOnly).includes(file)
        ? new Set(modulesForFile(file))
        : undefined,
    getModuleByUrl: async (url: string) => {
      if (options.rejectUrl?.includes(url)) {
        throw new Error(`Failed to resolve ${url}`);
      }

      return modules.get(urlOnly[url] ?? url);
    }
  };
  const plugin = vitePluginCompiledStylesheets();
  const ssr = { environment: { name: 'ssr' } };
  const compile = (id: string) =>
    (plugin.transform as (this: object, code: string, id: string) => void).call(ssr, css[id] ?? `/* ${id} */`, id);
  const server = {
    environments: {
      ssr: {
        moduleGraph,
        transformRequest: async (url: string) => {
          if (options.failToCompile?.includes(url)) {
            throw new Error(`${url} has a syntax error`);
          }

          compile(url);
          modules.get(url)!.transformResult = { dynamicDeps: [] };
        }
      }
    },
    config: { plugins: [plugin] },
    // Running a dynamic import target compiles it and the stylesheets it
    // imports. One that throws has its imports in the graph, but they never
    // ran, so its stylesheets didn't compile.
    ssrLoadModule: async (url: string) => {
      const module = modules.get(url)!;
      const fails = options.failToLoad?.includes(url);

      module.transformResult = { dynamicDeps: [] };
      (options.imports[url] ?? []).forEach((importedId) => {
        module.importedModules.add(moduleFor(importedId));

        if (!fails) {
          compile(importedId);
        }
      });

      if (fails) {
        module.ssrError = new Error(`${url} cannot run on the server`);
        throw module.ssrError;
      }

      module.ssrModule = {};
    }
  };

  for (const id of modules.keys()) {
    if (!options.notCompiled?.includes(id) && !notLoadedImports.has(id)) {
      compile(id);
    }
  }

  return {
    server: server as unknown as Parameters<typeof loadComponentStyles>[0],
    /** Saves new CSS for a stylesheet, which Vite marks by clearing its transform result. */
    editStylesheet: (id: string, newCss: string) => {
      css[id] = newCss;
      modules.get(id)!.transformResult = undefined;
    }
  };
}

describe('loadComponentStyles', () => {
  test('collects styles from children and grandchildren through their imports', async () => {
    const { server } = createFakeServer({
      imports: {
        'Page.astro': [styleOf('Page.astro'), 'Card.astro', 'runtime.js'],
        'Card.astro': ['Badge.astro'],
        'Badge.astro': [styleOf('Badge.astro'), styleOf('Badge.astro', 1)]
      }
    });

    const css = (await loadComponentStyles(server, ['Page.astro'])).stylesheets.join('\n');

    expect(css).toContain('Page.astro?astro&type=style&index=0');
    expect(css).toContain('Badge.astro?astro&type=style&index=0');
    expect(css).toContain('Badge.astro?astro&type=style&index=1');
  });

  test('skips a style block the component no longer has', async () => {
    // Card had two <style> blocks and now has one. Vite keeps the old
    // sub-module in the graph, but Card no longer imports it.
    const { server } = createFakeServer({
      imports: { 'Card.astro': [styleOf('Card.astro')] },
      stale: [styleOf('Card.astro', 1)]
    });

    const css = (await loadComponentStyles(server, ['Card.astro'])).stylesheets.join('\n');

    expect(css).toContain('Card.astro?astro&type=style&index=0');
    expect(css).not.toContain('index=1');
  });

  test('ships the CSS the server compiled for the render, under the id the markup used (issue #242)', async () => {
    // A CSS Module compiled once: the shipped class names are the markup's.
    const { server } = createFakeServer({
      imports: { 'Card.astro': ['card.module.css'] },
      css: { 'card.module.css': '._label_zyfWi { color: orange; }' }
    });

    const { stylesheets } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual(['._label_zyfWi { color: orange; }']);
  });

  test('ships the stylesheets a component imports, in import order with its style blocks', async () => {
    const { server } = createFakeServer({
      imports: {
        'Card.astro': ['card.css', 'card.module.scss', styleOf('Card.astro'), 'theme.css?raw', 'print.css?url']
      }
    });

    const { stylesheets } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual(['/* card.css */', '/* card.module.scss */', `/* ${styleOf('Card.astro')} */`]);
  });

  test('ships a Vue or Svelte component\'s style blocks (issue #241)', async () => {
    const vueStyle = 'Counter.vue?vue&type=style&index=0&scoped=7a7a37b1&lang.css';
    const svelteStyle = 'Toggle.svelte?svelte&type=style&lang.css';
    const { server } = createFakeServer({
      imports: {
        'Page.astro': ['Counter.vue', 'Toggle.svelte'],
        'Counter.vue': [vueStyle],
        'Toggle.svelte': [svelteStyle]
      }
    });

    const { stylesheets } = await loadComponentStyles(server, ['Page.astro']);

    expect(stylesheets).toEqual([`/* ${vueStyle} */`, `/* ${svelteStyle} */`]);
  });

  test('ships a stylesheet that a module the component imports brings in', async () => {
    const { server } = createFakeServer({
      imports: { 'Card.astro': ['theme.ts', styleOf('Card.astro')], 'theme.ts': ['tokens.css'] }
    });

    const { stylesheets } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual(['/* tokens.css */', `/* ${styleOf('Card.astro')} */`]);
  });

  test('ships a plugin\'s virtual stylesheet the server compiled (issue #243)', async () => {
    // UnoCSS's `virtual:uno.css`, for one, resolves to `/__uno.css`.
    const { server } = createFakeServer({
      imports: { 'Card.astro': ['\0virtual:plugin.css', '/__uno.css', styleOf('Card.astro')] }
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual([
      '/* \0virtual:plugin.css */',
      '/* /__uno.css */',
      `/* ${styleOf('Card.astro')} */`
    ]);
    expect(failures).toEqual([]);
  });

  test('ships the CSS of a component reached through a glob, whatever earlier renders loaded (issue #245)', async () => {
    // Loader renders its widgets through `import.meta.glob`. No earlier render
    // called the glob, so neither widget has been compiled yet. Like Astro
    // dev, every widget the glob matches ships its CSS.
    const { server } = createFakeServer({
      imports: {
        'Loader.astro': [styleOf('Loader.astro')],
        'WidgetA.astro': ['a.css'],
        'WidgetB.astro': [styleOf('WidgetB.astro')]
      },
      dynamicImports: { 'Loader.astro': ['WidgetA.astro', 'WidgetB.astro'] },
      notLoaded: ['WidgetA.astro', 'WidgetB.astro']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Loader.astro']);

    expect(stylesheets).toEqual([
      `/* ${styleOf('Loader.astro')} */`,
      '/* a.css */',
      `/* ${styleOf('WidgetB.astro')} */`
    ]);
    expect(failures).toEqual([]);
  });

  test('ships the CSS of a dynamically imported stylesheet on the first render (issue #245)', async () => {
    // `await import('./dark.css')`, which no render has called yet.
    const { server } = createFakeServer({
      imports: { 'Card.astro': [styleOf('Card.astro')] },
      dynamicImports: { 'Card.astro': ['dark.css'] },
      notCompiled: ['dark.css']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Card.astro')} */`, '/* dark.css */']);
    expect(failures).toEqual([]);
  });

  test('reports a dynamically imported stylesheet that fails to compile, so a static build fails', async () => {
    // `await import('./dark.scss')`, where dark.scss has a Sass error.
    const { server } = createFakeServer({
      imports: { 'Card.astro': [styleOf('Card.astro')] },
      dynamicImports: { 'Card.astro': ['dark.scss'] },
      notCompiled: ['dark.scss'],
      failToCompile: ['dark.scss']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Card.astro')} */`]);
    expect(failures).toEqual([{ moduleId: 'dark.scss', error: new Error('dark.scss has a syntax error') }]);
  });

  test('a glob match that fails to load reports nothing and the other matches still ship', async () => {
    // Broken imports a browser-only library, so running it on the server
    // throws. The story doesn't render it, so its style block isn't a failure,
    // on this render or a later one.
    const { server } = createFakeServer({
      imports: {
        'Loader.astro': [styleOf('Loader.astro')],
        'Broken.astro': [styleOf('Broken.astro')],
        'Widget.astro': [styleOf('Widget.astro')]
      },
      dynamicImports: { 'Loader.astro': ['Broken.astro', 'Widget.astro'] },
      notLoaded: ['Broken.astro', 'Widget.astro'],
      failToLoad: ['Broken.astro']
    });
    const expected = {
      stylesheets: [`/* ${styleOf('Loader.astro')} */`, `/* ${styleOf('Widget.astro')} */`],
      failures: []
    };

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual(expected);
    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual(expected);
  });

  test('keeps a component\'s styles when one of its dynamic imports can\'t be looked up', async () => {
    const { server } = createFakeServer({
      imports: {
        'Loader.astro': [styleOf('Loader.astro')],
        'Widget.astro': [styleOf('Widget.astro')]
      },
      dynamicImports: { 'Loader.astro': ['Broken.astro', 'Widget.astro'] },
      notLoaded: ['Widget.astro'],
      rejectUrl: ['Broken.astro']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Loader.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Loader.astro')} */`, `/* ${styleOf('Widget.astro')} */`]);
    expect(failures).toEqual([]);
  });

  test('ships a stylesheet\'s new CSS after it was edited, though the component stays cached', async () => {
    const { server, editStylesheet } = createFakeServer({
      imports: { 'Card.astro': ['card.css'] },
      css: { 'card.css': '.card { color: red; }' }
    });

    expect((await loadComponentStyles(server, ['Card.astro'])).stylesheets).toEqual(['.card { color: red; }']);

    editStylesheet('card.css', '.card { color: blue; }');

    expect((await loadComponentStyles(server, ['Card.astro'])).stylesheets).toEqual(['.card { color: blue; }']);
  });

  test('reports only a style block the server didn\'t compile, not another stylesheet', async () => {
    const { server } = createFakeServer({
      imports: { 'Card.astro': ['card.css', styleOf('Card.astro')] },
      notCompiled: ['card.css']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Card.astro')} */`]);
    expect(failures).toEqual([]);
  });

  test('returns each block as its own stylesheet, so a later block\'s @import still applies', async () => {
    const cardCss = '@layer base;\n@import "https://fonts.example/inter.css";\n.card { color: blue; }';
    const { server } = createFakeServer({
      imports: { 'Page.astro': [styleOf('Page.astro'), 'Card.astro'], 'Card.astro': [styleOf('Card.astro')] },
      css: { [styleOf('Page.astro')]: '.page { color: red; }', [styleOf('Card.astro')]: cardCss }
    });

    const { stylesheets } = await loadComponentStyles(server, ['Page.astro']);

    expect(stylesheets).toEqual(['.page { color: red; }', cardCss]);
  });

  test('keeps the blocks that compiled and reports the one that didn\'t', async () => {
    // Card imports a block that failed to compile (a Sass error, say).
    const { server } = createFakeServer({
      imports: { 'Card.astro': [styleOf('Card.astro'), styleOf('Card.astro', 1)] },
      notCompiled: [styleOf('Card.astro', 1)]
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets.join('\n')).toContain('Card.astro?astro&type=style&index=0');
    expect(failures).toEqual([{ moduleId: styleOf('Card.astro', 1), error: expect.any(Error) }]);
  });

  test('finds a component by file, since a file outside the root is keyed by a /@fs/ URL', async () => {
    // A story file outside the project root imports Badge, so Vite keys it by
    // `/@fs/...` — the static-build case that shipped no CSS for Badge.
    const { server } = createFakeServer({
      imports: {
        '/abs/Badge.astro': [styleOf('/abs/Badge.astro')]
      }
    });

    const css = (await loadComponentStyles(server, ['/abs/Badge.astro'])).stylesheets.join('\n');

    expect(css).toContain('/abs/Badge.astro?astro&type=style');
  });

  test('falls back to a URL lookup when no module is registered for the file', async () => {
    const { server } = createFakeServer({
      imports: { 'Panel.astro': [styleOf('Panel.astro')] },
      urlOnly: { '/@id/Panel': 'Panel.astro' }
    });

    const css = (await loadComponentStyles(server, ['/@id/Panel'])).stylesheets.join('\n');

    expect(css).toContain('Panel.astro?astro&type=style');
  });

  test('does not follow a stylesheet\'s imports to components the story never rendered', async () => {
    // Tailwind's PostCSS plugin records every file it scans as an import of
    // the global stylesheet, Other.astro included.
    const { server } = createFakeServer({
      imports: {
        'Page.astro': [styleOf('Page.astro'), 'global.css'],
        'global.css': ['Other.astro'],
        'Other.astro': [styleOf('Other.astro')]
      }
    });

    const css = (await loadComponentStyles(server, ['Page.astro'])).stylesheets.join('\n');

    expect(css).toContain('Page.astro?astro&type=style');
    expect(css).not.toContain('Other.astro');
  });

  test('includes a shared stylesheet once and survives import cycles', async () => {
    const { server } = createFakeServer({
      imports: {
        'A.astro': ['B.astro', styleOf('Shared.astro')],
        'B.astro': ['A.astro', styleOf('Shared.astro')]
      }
    });

    const { stylesheets } = await loadComponentStyles(server, ['A.astro', 'B.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Shared.astro')} */`]);
  });

  test('returns no CSS for a component without styles', async () => {
    const { server } = createFakeServer({ imports: { 'Plain.astro': ['runtime.js'] } });

    expect(await loadComponentStyles(server, ['Plain.astro'])).toEqual({ stylesheets: [], failures: [] });
  });

  test('reports a component file that is missing from the module graph', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'component-styles-'));
    const componentPath = join(dir, 'Card.astro');

    try {
      await writeFile(componentPath, '<div />');
      const { server } = createFakeServer({ imports: {} });

      const { failures } = await loadComponentStyles(server, [componentPath]);

      expect(failures).toEqual([{ moduleId: componentPath, error: expect.any(Error) }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('skips a component with no file here, such as a precompiled package component', async () => {
    const { server } = createFakeServer({ imports: {} });

    expect(await loadComponentStyles(server, ['/author/machine/src/Card.astro'])).toEqual({
      stylesheets: [],
      failures: []
    });
  });

  test('keeps the other components\' styles when looking one up fails', async () => {
    const { server } = createFakeServer({
      imports: { 'Card.astro': [styleOf('Card.astro')] },
      rejectUrl: ['/@id/broken']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['/@id/broken', 'Card.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Card.astro')} */`]);
    expect(failures).toEqual([{ moduleId: '/@id/broken', error: expect.any(Error) }]);
  });
});
