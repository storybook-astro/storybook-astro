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
};

const styleOf = (component: string, index = 0) =>
  `${component}?astro&type=style&index=${index}&lang.css`;

function createFakeServer(options: {
  imports: Record<string, string[]>;
  /** Imports each module loads with a dynamic `import()`, by the importer's id. */
  dynamicImports?: Record<string, string[]>;
  /** Modules reachable only by URL, the way Vite registers a file outside the root. */
  urlOnly?: Record<string, string>;
  /** Style sub-modules still in the graph after their `<style>` block was deleted. */
  stale?: string[];
  /** Stylesheets the server never compiled, such as a block that failed to. */
  notCompiled?: string[];
  /** Compiled CSS for particular stylesheets, keyed by their id. */
  css?: Record<string, string>;
  /** URLs whose lookup rejects. */
  rejectUrl?: string[];
}) {
  const modules = new Map<string, FakeModule>();
  const moduleFor = (id: string): FakeModule => {
    if (!modules.has(id)) {
      modules.set(id, { id, url: id, importedModules: new Set() });
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

      const id = urlOnly[url] ?? url;

      return Object.values(urlOnly).includes(id) ? modules.get(id) : undefined;
    }
  };
  const plugin = vitePluginCompiledStylesheets();
  const server = { environments: { ssr: { moduleGraph } }, config: { plugins: [plugin] } };
  const ssr = { environment: { name: 'ssr' } };

  for (const id of modules.keys()) {
    if (!options.notCompiled?.includes(id)) {
      (plugin.transform as (this: object, code: string, id: string) => void).call(
        ssr,
        options.css?.[id] ?? `/* ${id} */`,
        id
      );
    }
  }

  return { server: server as unknown as Parameters<typeof loadComponentStyles>[0] };
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

  test('doesn\'t follow a dynamic import, so earlier renders can\'t change the CSS (issue #245)', async () => {
    // Loader renders WidgetB. WidgetA is in the graph only because an earlier
    // story loaded it through the same import.meta.glob.
    const { server } = createFakeServer({
      imports: { 'WidgetA.astro': ['a.css'], 'WidgetB.astro': [styleOf('WidgetB.astro')] },
      dynamicImports: { 'Loader.astro': ['WidgetA.astro', 'WidgetB.astro'] }
    });

    const { stylesheets } = await loadComponentStyles(server, ['Loader.astro', 'WidgetB.astro']);

    expect(stylesheets).toEqual([`/* ${styleOf('WidgetB.astro')} */`]);
  });

  test('skips a stylesheet this render didn\'t load', async () => {
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
