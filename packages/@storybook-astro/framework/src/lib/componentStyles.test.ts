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
  /** The module's exports, set once the module runner ran it. Vite clears it when it invalidates the module. */
  ssrModule?: object | null;
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
  // Errors a later fix removes.
  const failToCompile = new Set(options.failToCompile);
  const throwWhenRun = new Set(options.throwWhenRun);
  const modules = new Map<string, FakeModule>();
  // A module in the starting graph was loaded by an earlier render. One that
  // first appears as a later compile's import hasn't been compiled yet.
  const moduleFor = (id: string, loaded = true): FakeModule => {
    if (!modules.has(id)) {
      modules.set(id, {
        id,
        url: id,
        importedModules: new Set(),
        transformResult: loaded ? {} : undefined,
        ssrModule: loaded ? {} : null,
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
    module.ssrModule = null;

    if (notLoaded.has(id)) {
      module.importedModules = new Set();
    }
  }

  for (const id of options.failedToRun ?? []) {
    moduleFor(id).ssrError = new Error(`${id} cannot run on the server`);
  }

  (options.stale ?? []).forEach((id) => moduleFor(id));

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
  // The modules the module runner holds, with the source it last ran each
  // with. A stylesheet's exports (a CSS Module's class names) come from it.
  const runnerCss = new Map<string, string>();
  // Style blocks deleted from their component. Astro fails to load one.
  const deletedStyleBlocks = new Set<string>();

  // Edits saved while the server compiles the module, by its id.
  const editsDuringCompile = new Map<string, () => void>();

  // Compiling a module records its imports, as Vite's import analysis does,
  // without compiling them. Compiling a stylesheet records its CSS. A compile
  // yields first, and later imports finish sooner, so a test sees whether
  // compiles overlap and whether the walk keeps import order anyway.
  const compile = async (url: string) => {
    const module = modules.get(url)!;
    const position = compiles.push(url);
    // The compile reads the file when it starts, so an edit saved while it
    // runs doesn't change the imports it records.
    const importsWhenRead = allImports[url] ?? [];
    const invalidatedWhenRead = module.lastInvalidationTimestamp;

    compilesInFlight++;
    editsDuringCompile.get(url)?.();
    editsDuringCompile.delete(url);
    mostCompilesAtOnce = Math.max(mostCompilesAtOnce, compilesInFlight);
    await new Promise((resolve) => setTimeout(resolve, 20 / position));
    compilesInFlight--;

    if (failToCompile.has(url)) {
      throw new Error(`${url} has a syntax error`);
    }

    if (deletedStyleBlocks.has(url)) {
      throw new Error(`No Astro CSS at index ${url.match(/index=(\d+)/)![1]}`);
    }

    module.importedModules = new Set(importsWhenRead.map((importedId) => moduleFor(importedId, false)));

    if (isAppliedStylesheet(url)) {
      compileCss(url);
    }

    // Like Vite, drop the result of a compile the module was invalidated
    // during: it compiled the file as it was before the save.
    if (module.lastInvalidationTimestamp === invalidatedWhenRead) {
      module.transformResult = {};
    }
  };

  const server = {
    environments: { ssr: { moduleGraph, transformRequest: compile } },
    // Vite's default asset types include images like these.
    config: { plugins: [plugin], assetsInclude: (id: string) => /\.(jpe?g|png|svg|webp)$/.test(id) },
    // Like Vite's module runner, a module it holds that has a transform result
    // isn't compiled or run again, so a compile outside the runner leaves its
    // exports, or its error, stale.
    ssrLoadModule: async (url: string) => {
      const module = modules.get(url)!;

      ran.push(url);

      if (module.transformResult && runnerCss.has(url)) {
        if (module.ssrError) {
          throw module.ssrError;
        }

        return;
      }

      if (!module.transformResult) {
        await compile(url);
      }

      runnerCss.set(url, css[url] ?? `/* ${url} */`);

      if (throwWhenRun.has(url)) {
        module.ssrError = new Error(`${url} cannot run on the server`);
        throw module.ssrError;
      }

      module.ssrModule = {};
    }
  };

  for (const [id, module] of modules) {
    if (!module.transformResult) {
      continue;
    }

    runnerCss.set(id, css[id] ?? `/* ${id} */`);

    if (isAppliedStylesheet(id) && !options.notCompiled?.includes(id)) {
      compileCss(id);
    }
  }

  const invalidate = (module: FakeModule) => {
    module.transformResult = undefined;
    module.ssrModule = null;
    module.ssrError = undefined;
    module.lastInvalidationTimestamp = Date.now();
  };

  /**
   * Saves a module's file, which makes Vite invalidate it. New `imports`
   * are what its next compile records; a style block it no longer imports
   * was deleted from the file.
   */
  const edit = (id: string, newCss?: string, newImports?: string[]) => {
    if (newCss !== undefined) {
      css[id] = newCss;
    }

    if (newImports) {
      for (const oldImport of allImports[id] ?? []) {
        if (oldImport.startsWith(`${id}?astro&type=style`) && !newImports.includes(oldImport)) {
          deletedStyleBlocks.add(oldImport);
        }
      }

      allImports[id] = newImports;
    }

    // Vite invalidates every module of the saved file, style blocks included.
    modulesForFile(id.split('?')[0]).forEach(invalidate);
  };

  return {
    server: server as unknown as Parameters<typeof loadComponentStyles>[0],
    edit,
    /** Saves an edit to a module while the server's next compile of it runs. */
    editWhileCompiling: (id: string, newCss?: string, newImports?: string[]) => {
      editsDuringCompile.set(id, () => edit(id, newCss, newImports));
    },
    /** Saves a fix to a module that failed to compile or to run. */
    fix: (id: string) => {
      failToCompile.delete(id);
      throwWhenRun.delete(id);
      edit(id);
    },
    /** Changes what a module's next compile imports, as a module mock does for the render that uses it. */
    resolveImportsTo: (id: string, imports: string[]) => {
      allImports[id] = imports;
    },
    /** Invalidates every module, as the render handler does after a story with module mocks. */
    invalidateAll: () => modules.forEach(invalidate),
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
    const { server, ran, compiles } = createFakeServer({
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
    expect(compiles.filter((url) => url === 'Broken.astro')).toHaveLength(1);
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

  test('doesn\'t compile the images or JSON files a glob matches, which can\'t import CSS', async () => {
    // `import.meta.glob('../assets/gallery/*.jpg')` and a lazy `import('./data.json')`.
    const { server, compiles } = createFakeServer({
      imports: { 'Gallery.astro': [styleOf('Gallery.astro')] },
      dynamicImports: { 'Gallery.astro': ['gallery/one.jpg', 'gallery/two.jpg', 'data.json'] },
      notLoaded: ['gallery/one.jpg', 'gallery/two.jpg', 'data.json']
    });

    expect(await loadComponentStyles(server, ['Gallery.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Gallery.astro')} */`],
      failures: []
    });
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

  test('doesn\'t follow the old imports of a glob match an edit broke', async () => {
    // An earlier story rendered Widget, then an edit left a syntax error in
    // it. Its imports in the graph are from before the edit, and its style
    // block can't load while the component doesn't compile. The story doesn't
    // render Widget, so nothing is reported and no stale CSS ships.
    const { server, edit, ran } = createFakeServer({
      imports: { 'Loader.astro': [styleOf('Loader.astro')], 'Widget.astro': [styleOf('Widget.astro')] },
      dynamicImports: { 'Loader.astro': ['Widget.astro'] },
      failToCompile: ['Widget.astro', styleOf('Widget.astro')]
    });

    edit('Widget.astro');

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Loader.astro')} */`],
      failures: []
    });
    expect(ran).toEqual([]);
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

  test('compiles an edited glob match the runner holds for its new imports, and leaves the runner to compile it again', async () => {
    // An earlier story rendered Widget, then an edit swapped its <style>
    // block for a stylesheet. The walk compiles it for its new imports, but
    // leaves no transform result behind, which would make the module runner
    // keep the old Widget when a later story renders it.
    const { server, edit, compiles, ran } = createFakeServer({
      imports: { 'Loader.astro': [], 'Widget.astro': [styleOf('Widget.astro')] },
      dynamicImports: { 'Loader.astro': ['Widget.astro'] }
    });

    edit('Widget.astro', undefined, ['widget.css']);

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual({
      stylesheets: ['/* widget.css */'],
      failures: []
    });
    expect(compiles.filter((url) => url === 'Widget.astro')).toHaveLength(1);
    expect(ran).not.toContain('Widget.astro');

    await server.ssrLoadModule('Widget.astro');

    expect(compiles.filter((url) => url === 'Widget.astro')).toHaveLength(2);
  });

  test('doesn\'t ship or load a style block an edit deleted from a glob match the runner holds', async () => {
    // Heart had two <style> blocks and now has one. Its old imports still
    // list the second, which Astro can no longer load.
    const { server, edit } = createFakeServer({
      imports: {
        'Loader.astro': [],
        'Heart.astro': [styleOf('Heart.astro'), styleOf('Heart.astro', 1)]
      },
      dynamicImports: { 'Loader.astro': ['Heart.astro'] }
    });

    edit('Heart.astro', undefined, [styleOf('Heart.astro')]);

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Heart.astro')} */`],
      failures: []
    });
  });

  test('ships the real imports\' CSS for a glob match the runner ran with a module mock', async () => {
    // A story with module mocks rendered Widget, whose `./Chart.astro`
    // resolved to the mock. The render handler invalidates every module
    // afterwards, and the next story's walk follows Widget's real imports.
    const { server, resolveImportsTo, invalidateAll } = createFakeServer({
      imports: {
        'Loader.astro': [],
        'Widget.astro': ['Chart.mock.astro'],
        'Chart.mock.astro': [styleOf('Chart.mock.astro')],
        'Chart.astro': [styleOf('Chart.astro')]
      },
      dynamicImports: { 'Loader.astro': ['Widget.astro'] }
    });

    resolveImportsTo('Widget.astro', ['Chart.astro']);
    invalidateAll();
    // The next story renders Loader, which the runner runs again.
    await server.ssrLoadModule('Loader.astro');

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Chart.astro')} */`],
      failures: []
    });
  });

  test('lets the runner run a fixed glob match again after the walk compiled it and its render failed', async () => {
    // The walk compiled Widget, then a story rendered it and it threw. Once
    // it's fixed, the runner's next import compiles and runs the fixed file.
    const { server, fix, compiles } = createFakeServer({
      imports: { 'Loader.astro': [], 'Widget.astro': [styleOf('Widget.astro')] },
      dynamicImports: { 'Loader.astro': ['Widget.astro'] },
      notLoaded: ['Widget.astro'],
      throwWhenRun: ['Widget.astro']
    });

    await loadComponentStyles(server, ['Loader.astro']);
    await expect(server.ssrLoadModule('Widget.astro')).rejects.toThrow('cannot run on the server');

    fix('Widget.astro');
    await loadComponentStyles(server, ['Loader.astro']);
    const compilesBeforeRender = compiles.length;

    await server.ssrLoadModule('Widget.astro');

    expect(compiles.slice(compilesBeforeRender)).toContain('Widget.astro');
  });

  test('compiles a glob match whose first compile failed again once it\'s fixed', async () => {
    const { server, fix } = createFakeServer({
      imports: { 'Loader.astro': [], 'Broken.astro': [styleOf('Broken.astro')] },
      dynamicImports: { 'Loader.astro': ['Broken.astro'] },
      notLoaded: ['Broken.astro'],
      failToCompile: ['Broken.astro']
    });

    expect((await loadComponentStyles(server, ['Loader.astro'])).stylesheets).toEqual([]);

    fix('Broken.astro');

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Broken.astro')} */`],
      failures: []
    });
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

  test('doesn\'t ship the CSS of the server islands in Astro\'s server island map', async () => {
    // Astro's manifest reaches the island map, which imports every server
    // island the runner has discovered so far, whatever this story renders.
    const manifest = '\0virtual:astro:server-island-manifest';
    const { server, compiles } = createFakeServer({
      imports: {
        'Card.astro': [styleOf('Card.astro')],
        [manifest]: ['Island.astro'],
        'Island.astro': [styleOf('Island.astro'), 'island.css']
      },
      dynamicImports: { 'Card.astro': [manifest] }
    });

    expect(await loadComponentStyles(server, ['Card.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Card.astro')} */`],
      failures: []
    });
    expect(compiles).toEqual([]);
  });

  test('stops at Astro\'s page modules, so reaching the page list doesn\'t ship every page\'s CSS', async () => {
    // On Astro 7, `astro:config/server` imports the manifest, which imports
    // `virtual:astro:pages`, whose page map lazily imports every page.
    const page = '\0virtual:astro:page:src/pages/index@_@astro';
    const { server, compiles } = createFakeServer({
      imports: {
        'Card.astro': [styleOf('Card.astro'), '\0astro:config/server'],
        '\0astro:config/server': ['\0virtual:astro:manifest'],
        '\0virtual:astro:manifest': ['\0virtual:astro:pages'],
        [page]: ['Layout.astro'],
        'Layout.astro': [styleOf('Layout.astro')]
      },
      dynamicImports: { '\0virtual:astro:pages': [page] },
      notLoaded: [page]
    });

    const { stylesheets, failures } = await loadComponentStyles(server, ['Card.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('Card.astro')} */`]);
    expect(failures).toEqual([]);
    expect(compiles).toEqual([]);
  });

  test('recompiles an edited glob match that only the walk compiled, and ships its new CSS', async () => {
    // No story has rendered Widget, so the module runner doesn't hold it.
    // After an edit that swaps its second <style> block for a stylesheet,
    // the walk compiles it again, so the deleted block's CSS doesn't ship
    // and loading it doesn't fail. Later walks don't compile it again.
    const { server, edit, ran, compiles } = createFakeServer({
      imports: {
        'Loader.astro': [],
        'Widget.astro': [styleOf('Widget.astro'), styleOf('Widget.astro', 1)]
      },
      dynamicImports: { 'Loader.astro': ['Widget.astro'] },
      notLoaded: ['Widget.astro']
    });

    expect((await loadComponentStyles(server, ['Loader.astro'])).stylesheets).toEqual([
      `/* ${styleOf('Widget.astro')} */`,
      `/* ${styleOf('Widget.astro', 1)} */`
    ]);

    edit('Widget.astro', undefined, [styleOf('Widget.astro'), 'widget.css']);

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Widget.astro')} */`, '/* widget.css */'],
      failures: []
    });
    expect(compiles.filter((url) => url === 'Widget.astro')).toHaveLength(2);

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Widget.astro')} */`, '/* widget.css */'],
      failures: []
    });
    expect(compiles.filter((url) => url === 'Widget.astro')).toHaveLength(2);
    expect(ran).not.toContain('Widget.astro');
  });

  test('recompiles an edited glob match that was saved again while the walk compiled it', async () => {
    // The second save lands while the walk compiles the first, so that
    // compile records the first save's imports and Vite drops its result.
    // The next walk compiles Widget again and ships the second save's CSS.
    const { server, edit, editWhileCompiling, compiles } = createFakeServer({
      imports: {
        'Loader.astro': [],
        'Widget.astro': [styleOf('Widget.astro')]
      },
      dynamicImports: { 'Loader.astro': ['Widget.astro'] },
      notLoaded: ['Widget.astro']
    });

    await loadComponentStyles(server, ['Loader.astro']);
    edit('Widget.astro', undefined, [styleOf('Widget.astro'), 'widget.css']);
    // Leaves the second save a later timestamp than the first.
    await new Promise((resolve) => setTimeout(resolve, 5));
    editWhileCompiling('Widget.astro', undefined, [styleOf('Widget.astro'), 'theme.css']);

    expect((await loadComponentStyles(server, ['Loader.astro'])).stylesheets).toEqual([
      `/* ${styleOf('Widget.astro')} */`,
      '/* widget.css */'
    ]);

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Widget.astro')} */`, '/* theme.css */'],
      failures: []
    });
    expect(compiles.filter((url) => url === 'Widget.astro')).toHaveLength(3);
  });

  test('recompiles a glob match the walk compiled during a mocked render with its real imports', async () => {
    // While a story with module mocks renders, Widget's `./theme.ts` resolves
    // to the mock. The render handler invalidates every module afterwards,
    // and the next story's walk compiles Widget again against the real one.
    const { server, resolveImportsTo, invalidateAll } = createFakeServer({
      imports: {
        'Loader.astro': [styleOf('Loader.astro')],
        'Widget.astro': ['theme.mock.ts'],
        'theme.mock.ts': []
      },
      dynamicImports: { 'Loader.astro': ['Widget.astro'] },
      notLoaded: ['Widget.astro']
    });

    expect((await loadComponentStyles(server, ['Loader.astro'])).stylesheets).toEqual([
      `/* ${styleOf('Loader.astro')} */`
    ]);

    resolveImportsTo('Widget.astro', ['theme.ts']);
    resolveImportsTo('theme.ts', ['tokens.css']);
    invalidateAll();
    // The next story renders Loader, which the runner runs again.
    await server.ssrLoadModule('Loader.astro');

    expect(await loadComponentStyles(server, ['Loader.astro'])).toEqual({
      stylesheets: [`/* ${styleOf('Loader.astro')} */`, '/* tokens.css */'],
      failures: []
    });
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
