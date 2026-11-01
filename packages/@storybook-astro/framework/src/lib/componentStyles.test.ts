import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadComponentStyles } from './componentStyles.ts';
import { isAppliedStylesheet, vitePluginCompiledStylesheets } from './compiledStylesheets.ts';

// A fake SSR module graph: each module lists the ids it imports. Like Vite's,
// a file lookup returns every module for the file, sub-modules included. The
// server compiles every stylesheet in the graph through the real
// `vitePluginCompiledStylesheets`, each to a CSS comment naming it, so tests
// can assert on exactly which ones shipped.

type FakeModule = {
  id: string;
  url: string;
  importedModules: Set<FakeModule>;
  /** Set once the module compiled. Vite clears it when it invalidates the module. */
  transformResult?: object;
  lastInvalidationTimestamp: number;
  lastHMRTimestamp: number;
  /** Set when running the module threw. */
  ssrError?: Error;
};

const styleOf = (component: string, index = 0) =>
  `${component}?astro&type=style&index=${index}&lang.css`;

function createFakeServer(options: {
  imports: Record<string, string[]>;
  /**
   * Imports each module loads with a dynamic `import()` or `import.meta.glob`,
   * by the importer's id. A virtual module's is listed under its `/@id/` URL,
   * as Vite records it.
   */
  dynamicImports?: Record<string, string[]>;
  /**
   * Dynamic import targets no render has called yet. Vite has a node for each
   * but hasn't compiled it, so its imports (from `imports`) only appear once
   * the server compiles it, and their CSS once the server compiles them.
   */
  notLoaded?: string[];
  /** Modules that throw when the server runs them, such as a component importing a browser-only library. */
  throwWhenRun?: string[];
  /** Modules an earlier render ran, which threw. Their imports never compiled. */
  failedToRun?: string[];
  /** Modules reachable only by URL, the way Vite registers a file outside the root. */
  urlOnly?: Record<string, string>;
  /** Style sub-modules still in the graph after their `<style>` block was deleted. */
  stale?: string[];
  /** Stylesheets the server never compiled, such as a block that failed to. */
  notCompiled?: string[];
  /** Compiled CSS for particular stylesheets, keyed by their id. */
  css?: Record<string, string>;
  /** Modules whose compile throws, such as a Sass file with a syntax error. */
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
        transformResult: {},
        lastInvalidationTimestamp: 0,
        lastHMRTimestamp: 0
      });
    }

    return modules.get(id)!;
  };

  // The graph keys a virtual module by its id, not the `/@id/` URL.
  const idForUrl = (url: string) =>
    url.startsWith('/@id/__x00__') ? `\0${url.slice('/@id/__x00__'.length)}` : url;
  const allImports: Record<string, string[]> = { ...options.imports };

  for (const [id, imported] of Object.entries(options.dynamicImports ?? {})) {
    allImports[id] = [...(allImports[id] ?? []), ...imported.map(idForUrl)];
  }

  for (const [id, imported] of Object.entries(allImports)) {
    imported.forEach((importedId) => moduleFor(id).importedModules.add(moduleFor(importedId)));
  }

  // A module no render loaded hasn't compiled, and neither have the imports
  // only it reaches.
  const notLoaded = new Set(options.notLoaded);
  const reachedOnlyThroughNotLoaded = new Set<string>();
  const reachedFromLoaded = new Set<string>();
  const markReached = (id: string, reached: Set<string>) => {
    if (reached.has(id)) {
      return;
    }
    reached.add(id);
    (allImports[id] ?? []).forEach((importedId) => {
      if (!notLoaded.has(importedId) || reached === reachedOnlyThroughNotLoaded) {
        markReached(importedId, reached);
      }
    });
  };

  Object.keys(allImports)
    .filter((id) => !notLoaded.has(id))
    .forEach((id) => markReached(id, reachedFromLoaded));
  notLoaded.forEach((id) => markReached(id, reachedOnlyThroughNotLoaded));

  for (const id of reachedOnlyThroughNotLoaded) {
    if (reachedFromLoaded.has(id)) {
      continue;
    }

    const module = moduleFor(id);

    module.transformResult = undefined;

    if (notLoaded.has(id)) {
      module.importedModules = new Set();
    }
  }

  for (const id of options.failedToRun ?? []) {
    moduleFor(id).ssrError = new Error(`${id} cannot run on the server`);
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
  const compileCss = (id: string) =>
    (plugin.transform as (this: object, code: string, id: string) => void).call(ssr, css[id] ?? `/* ${id} */`, id);

  /** Each URL the server compiled, in the order it started compiling them. */
  const compiles: string[] = [];
  /** Each URL the module runner ran. */
  const ran: string[] = [];
  let compilesInFlight = 0;
  let mostCompilesAtOnce = 0;
  // The CSS the module runner last ran each stylesheet with. Its exports (a
  // CSS Module's class names) come from it.
  const runnerCss = new Map<string, string>();

  // Compiling a module records its imports, as Vite's import analysis does,
  // without compiling them. Compiling a stylesheet records its CSS. A compile
  // yields first, and later imports finish sooner, so a test sees whether
  // compiles overlap and whether the walk keeps import order anyway.
  const compile = async (url: string) => {
    const module = modules.get(url)!;
    const position = compiles.push(url);

    compilesInFlight++;
    mostCompilesAtOnce = Math.max(mostCompilesAtOnce, compilesInFlight);
    await new Promise((resolve) => setTimeout(resolve, 20 / position));
    compilesInFlight--;

    if (options.failToCompile?.includes(url)) {
      throw new Error(`${url} has a syntax error`);
    }

    (allImports[url] ?? []).forEach((importedId) => module.importedModules.add(moduleFor(importedId)));

    if (isAppliedStylesheet(url)) {
      compileCss(url);
    }

    module.transformResult = {};
  };

  const server = {
    environments: { ssr: { moduleGraph, transformRequest: compile } },
    config: { plugins: [plugin] },
    // Like Vite's module runner, a module that has a transform result isn't
    // compiled again, so a compile outside the runner leaves its exports stale.
    ssrLoadModule: async (url: string) => {
      const module = modules.get(url)!;

      ran.push(url);

      if (module.transformResult && runnerCss.has(url)) {
        return;
      }

      if (!module.transformResult) {
        await compile(url);
      }

      if (options.throwWhenRun?.includes(url)) {
        module.ssrError = new Error(`${url} cannot run on the server`);
        throw module.ssrError;
      }

      runnerCss.set(url, css[url] ?? `/* ${url} */`);
    }
  };

  for (const [id, module] of modules) {
    if (module.transformResult && isAppliedStylesheet(id) && !options.notCompiled?.includes(id)) {
      compileCss(id);
      runnerCss.set(id, css[id] ?? `/* ${id} */`);
    }
  }

  return {
    server: server as unknown as Parameters<typeof loadComponentStyles>[0],
    /** Saves a module's file, which makes Vite invalidate it. */
    edit: (id: string, newCss?: string) => {
      if (newCss !== undefined) {
        css[id] = newCss;
      }

      const module = modules.get(id)!;

      module.transformResult = undefined;
      module.lastInvalidationTimestamp = Date.now();
    },
    /** The CSS the module runner last ran a stylesheet with, which its exports (CSS Module class names) come from. */
    ranWith: (id: string) => runnerCss.get(id),
    compiles,
    ran,
    mostCompilesAtOnce: () => mostCompilesAtOnce
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
      notLoaded: ['dark.css']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Card.astro')} */`, '/* dark.css */']);
    expect(failures).toEqual([]);
  });

  test('ships the CSS of a dynamically imported virtual stylesheet', async () => {
    // `await import('virtual:theme.css')`, which Vite records as `/@id/__x00__virtual:theme.css`.
    const { server } = createFakeServer({
      imports: { 'Card.astro': [styleOf('Card.astro')] },
      dynamicImports: { 'Card.astro': ['/@id/__x00__virtual:theme.css'] },
      notLoaded: ['\0virtual:theme.css']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Card.astro')} */`, '/* \0virtual:theme.css */']);
    expect(failures).toEqual([]);
  });

  test('reports a dynamically imported stylesheet that fails to compile, so a static build fails', async () => {
    // `await import('./dark.scss')`, where dark.scss has a Sass error.
    const { server } = createFakeServer({
      imports: { 'Card.astro': [styleOf('Card.astro')] },
      dynamicImports: { 'Card.astro': ['dark.scss'] },
      notLoaded: ['dark.scss'],
      failToCompile: ['dark.scss']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Card.astro')} */`]);
    expect(failures).toEqual([{ moduleId: 'dark.scss', error: new Error('dark.scss has a syntax error') }]);
  });

  test('ships the CSS of a glob match that would throw if it ran, without running it (issue #277)', async () => {
    // Broken imports a browser-only library, so running it on the server
    // throws. The story doesn't render it, so compiling it is enough: its CSS
    // ships as in Astro dev, and nothing logs an error, on this render or a
    // later one.
    const { server, ran } = createFakeServer({
      imports: {
        'Loader.astro': [styleOf('Loader.astro')],
        'Broken.astro': [styleOf('Broken.astro')],
        'Widget.astro': [styleOf('Widget.astro')]
      },
      dynamicImports: { 'Loader.astro': ['Broken.astro', 'Widget.astro'] },
      notLoaded: ['Broken.astro', 'Widget.astro'],
      throwWhenRun: ['Broken.astro']
    });
    const expected = {
      stylesheets: [
        `/* ${styleOf('Loader.astro')} */`,
        `/* ${styleOf('Broken.astro')} */`,
        `/* ${styleOf('Widget.astro')} */`
      ],
      failures: []
    };

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual(expected);
    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual(expected);
    expect(ran).toEqual([]);
  });

  test('compiles a module\'s dynamic imports at once, and still ships their CSS in import order', async () => {
    const { server, mostCompilesAtOnce } = createFakeServer({
      imports: {
        'Loader.astro': [],
        'One.astro': [styleOf('One.astro')],
        'Two.astro': [styleOf('Two.astro')],
        'Three.astro': [styleOf('Three.astro')]
      },
      dynamicImports: { 'Loader.astro': ['One.astro', 'Two.astro', 'Three.astro'] },
      notLoaded: ['One.astro', 'Two.astro', 'Three.astro']
    });

    const { stylesheets } = await loadComponentStyles(server, ['Loader.astro']);

    expect(mostCompilesAtOnce()).toBe(3);
    expect(stylesheets).toEqual([
      `/* ${styleOf('One.astro')} */`,
      `/* ${styleOf('Two.astro')} */`,
      `/* ${styleOf('Three.astro')} */`
    ]);
  });

  test('ignores glob matches loaded with ?raw or ?url', async () => {
    // `import.meta.glob('./*.astro', { query: '?raw' })` imports the source text.
    const { server, compiles } = createFakeServer({
      imports: { 'Loader.astro': [styleOf('Loader.astro')], 'Widget.astro': [styleOf('Widget.astro')] },
      dynamicImports: { 'Loader.astro': ['Widget.astro?raw', 'theme.css?url'] },
      notLoaded: ['Widget.astro?raw', 'theme.css?url']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Loader.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Loader.astro')} */`]);
    expect(failures).toEqual([]);
    expect(compiles).toEqual([]);
  });

  test('compiles and reports a broken stylesheet once, however many components import it', async () => {
    const { server, compiles } = createFakeServer({
      imports: { 'A.astro': [], 'B.astro': [] },
      dynamicImports: { 'A.astro': ['dark.scss'], 'B.astro': ['dark.scss'] },
      notLoaded: ['dark.scss'],
      failToCompile: ['dark.scss']
    });

    const { failures } = await loadComponentStyles(server, ['A.astro', 'B.astro']);

    expect(failures).toEqual([{ moduleId: 'dark.scss', error: new Error('dark.scss has a syntax error') }]);
    expect(compiles).toEqual(['dark.scss']);
  });

  test('keeps a component\'s styles when a glob match doesn\'t compile', async () => {
    // A syntax error in Broken fails the render that calls it. This story
    // doesn't, so it isn't a style failure.
    const { server } = createFakeServer({
      imports: {
        'Loader.astro': [styleOf('Loader.astro')],
        'Widget.astro': [styleOf('Widget.astro')]
      },
      dynamicImports: { 'Loader.astro': ['Broken.astro', 'Widget.astro'] },
      notLoaded: ['Broken.astro', 'Widget.astro'],
      failToCompile: ['Broken.astro']
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Loader.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Loader.astro')} */`, `/* ${styleOf('Widget.astro')} */`]);
    expect(failures).toEqual([]);
  });

  test('doesn\'t walk a module that failed to run, whose style blocks never compiled', async () => {
    const { server } = createFakeServer({
      imports: { 'Page.astro': [styleOf('Page.astro'), 'Broken.astro'], 'Broken.astro': [styleOf('Broken.astro')] },
      failedToRun: ['Broken.astro'],
      notCompiled: [styleOf('Broken.astro')]
    });

    expect(await loadComponentStyles(server, ['Page.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Page.astro')} */`],
      failures: []
    });
  });

  test('leaves an edited glob match for the module runner to recompile, and ships its new CSS', async () => {
    // An earlier story rendered Widget, then it was edited. Compiling it here
    // would make the runner keep the old Widget when a later story renders it.
    const { server, edit, compiles, ran } = createFakeServer({
      imports: { 'Loader.astro': [], 'Widget.astro': [styleOf('Widget.astro')] },
      dynamicImports: { 'Loader.astro': ['Widget.astro'] }
    });

    edit('Widget.astro');
    edit(styleOf('Widget.astro'), '.widget { color: blue; }');

    const { stylesheets } = await loadComponentStyles(server, ['Loader.astro']);

    expect(stylesheets).toEqual(['.widget { color: blue; }']);
    expect(compiles).not.toContain('Widget.astro');
    expect(ran).not.toContain('Widget.astro');
  });

  test('leaves Astro\'s server island map for the module runner to recompile', async () => {
    const manifest = '\0virtual:astro:server-island-manifest';
    const { server, compiles } = createFakeServer({
      imports: { 'Card.astro': [] },
      dynamicImports: { 'Card.astro': [manifest] },
      notLoaded: [manifest]
    });

    await loadComponentStyles(server, ['Card.astro']);

    expect(compiles).toEqual([]);
  });

  test('ships a stylesheet\'s new CSS after it was edited, though the component stays cached', async () => {
    const { server, edit } = createFakeServer({
      imports: { 'Card.astro': ['card.css'] },
      css: { 'card.css': '.card { color: red; }' }
    });

    expect((await loadComponentStyles(server, ['Card.astro'])).stylesheets).toEqual(['.card { color: red; }']);

    edit('card.css', '.card { color: blue; }');

    expect((await loadComponentStyles(server, ['Card.astro'])).stylesheets).toEqual(['.card { color: blue; }']);
  });

  test('recompiles an edited CSS Module through the module runner, so its class names match the CSS', async () => {
    // A transform outside the runner would ship the new CSS while the next
    // render still used the old class map.
    const { server, edit, ranWith } = createFakeServer({
      imports: { 'Card.astro': ['card.module.css'] },
      css: { 'card.module.css': '._label_aaaaa { color: red; }' }
    });

    edit('card.module.css', '._label_bbbbb { color: blue; }');

    const { stylesheets } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual(['._label_bbbbb { color: blue; }']);
    expect(ranWith('card.module.css')).toBe('._label_bbbbb { color: blue; }');
  });

  test('reports an edited stylesheet that no longer compiles and keeps its last CSS', async () => {
    const { server, edit } = createFakeServer({
      imports: { 'Card.astro': ['card.scss'] },
      css: { 'card.scss': '.card { color: red; }' },
      failToCompile: ['card.scss']
    });

    edit('card.scss', '.card { color: ');

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual(['.card { color: red; }']);
    expect(failures).toEqual([{ moduleId: 'card.scss', error: new Error('card.scss has a syntax error') }]);
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
