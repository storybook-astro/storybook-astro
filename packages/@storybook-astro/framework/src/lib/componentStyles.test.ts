import { describe, expect, test, vi } from 'vitest';
import { loadComponentStyles } from './componentStyles.ts';

// A fake SSR module graph: each module lists the ids it imports. Like Vite's,
// a file lookup returns every module for the file, sub-modules included. Style
// sub-modules "compile" to a CSS comment naming them, so tests can assert on
// exactly which ones were loaded; `stale` ones throw the way Astro does for a
// `<style>` block that no longer exists.

type FakeModule = { id: string; importedModules: Set<FakeModule> };

const styleOf = (component: string, index = 0) =>
  `${component}?astro&type=style&index=${index}&lang.css`;

function createFakeServer(options: {
  imports: Record<string, string[]>;
  /** Modules reachable only by URL, the way Vite registers a file outside the root. */
  urlOnly?: Record<string, string>;
  /** Style sub-modules still in the graph after their `<style>` block was deleted. */
  stale?: string[];
}) {
  const modules = new Map<string, FakeModule>();
  const moduleFor = (id: string): FakeModule => {
    if (!modules.has(id)) {
      modules.set(id, { id, importedModules: new Set() });
    }

    return modules.get(id)!;
  };

  for (const [id, imported] of Object.entries(options.imports)) {
    imported.forEach((importedId) => moduleFor(id).importedModules.add(moduleFor(importedId)));
  }

  const stale = options.stale ?? [];

  stale.forEach(moduleFor);

  const urlOnly = options.urlOnly ?? {};
  const ssrLoadModule = vi.fn(async (id: string) => {
    if (stale.some((staleId) => id.startsWith(staleId.replace(/&lang\.\w+$/, '')))) {
      throw new Error(`No Astro CSS at index ${id}`);
    }

    return { default: `/* ${id} */` };
  });

  const modulesForFile = (file: string) =>
    [...modules.values()].filter((module) => module.id.split('?')[0] === file);

  const server = {
    moduleGraph: {
      getModulesByFile: (file: string) =>
        modules.has(file) && !Object.values(urlOnly).includes(file)
          ? new Set(modulesForFile(file))
          : undefined,
      getModuleByUrl: async (url: string) => {
        const id = urlOnly[url] ?? url;

        return Object.values(urlOnly).includes(id) ? modules.get(id) : undefined;
      }
    },
    ssrLoadModule
  };

  return { server: server as unknown as Parameters<typeof loadComponentStyles>[0], ssrLoadModule };
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

    const css = await loadComponentStyles(server, ['Page.astro']);

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

    const css = await loadComponentStyles(server, ['Card.astro']);

    expect(css).toContain('Card.astro?astro&type=style&index=0');
    expect(css).not.toContain('index=1');
  });

  test('loads each style with `inline` before `lang.*`, which Vite needs last', async () => {
    const { server, ssrLoadModule } = createFakeServer({
      imports: { 'Card.astro': [`Card.astro?astro&type=style&index=0&lang.scss`] }
    });

    await loadComponentStyles(server, ['Card.astro']);

    expect(ssrLoadModule).toHaveBeenCalledWith('Card.astro?astro&type=style&index=0&inline&lang.scss');
  });

  test('finds a component by file when it is only registered under a /@fs/ URL', async () => {
    // A story file outside the project root imports Badge, so Vite keys it by
    // `/@fs/...` — the static-build case that shipped no CSS for Badge.
    const { server } = createFakeServer({
      imports: {
        '/abs/Badge.astro': [styleOf('/abs/Badge.astro')]
      }
    });

    const css = await loadComponentStyles(server, ['/abs/Badge.astro']);

    expect(css).toContain('/abs/Badge.astro?astro&type=style');
  });

  test('falls back to a URL lookup when no module is registered for the file', async () => {
    const { server } = createFakeServer({
      imports: { 'Panel.astro': [styleOf('Panel.astro')] },
      urlOnly: { '/@id/Panel': 'Panel.astro' }
    });

    const css = await loadComponentStyles(server, ['/@id/Panel']);

    expect(css).toContain('Panel.astro?astro&type=style');
  });

  test('includes a shared stylesheet once and survives import cycles', async () => {
    const { server, ssrLoadModule } = createFakeServer({
      imports: {
        'A.astro': ['B.astro', styleOf('Shared.astro')],
        'B.astro': ['A.astro', styleOf('Shared.astro')]
      }
    });

    await loadComponentStyles(server, ['A.astro', 'B.astro']);

    expect(ssrLoadModule).toHaveBeenCalledTimes(1);
  });

  test('returns an empty string for components without styles or unknown ids', async () => {
    const { server } = createFakeServer({ imports: { 'Plain.astro': ['runtime.js'] } });

    expect(await loadComponentStyles(server, ['Plain.astro', 'Missing.astro'])).toBe('');
  });
});
