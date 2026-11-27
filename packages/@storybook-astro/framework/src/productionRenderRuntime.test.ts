import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import {
  createProductionRenderRuntime,
  findMissingBrowserGlobal,
  renderProductionStoryToHtml,
  type ProductionRenderRuntime,
  type ProductionStoryEntry
} from './productionRenderRuntime.ts';

const resolveFrom = '/project';

const story: ProductionStoryEntry = {
  id: 'components-button--primary',
  importPath: './src/Button.stories.ts',
  componentPath: './src/Button.astro',
  exportName: 'Primary',
  title: 'Components/Button',
  name: 'Primary'
};

/** A stand-in Astro component factory; only its identity and `function`-ness matter here. */
function ButtonAstro() {
  return '';
}

function createRuntime(
  storyModule: Record<string, unknown>,
  composeDecoratedTree: ProductionRenderRuntime['composeDecoratedTree'] = async () => ({
    node: undefined,
    skippedDecorators: []
  })
): {
  runtime: ProductionRenderRuntime;
  renderAstroStory: ReturnType<typeof vi.fn>;
} {
  const renderAstroStory = vi.fn(async () => '<button>rendered</button>');

  return {
    runtime: {
      loadModule: async () => storyModule,
      renderAstroStory,
      composeDecoratedTree,
      close: async () => {}
    },
    renderAstroStory
  };
}

describe('renderProductionStoryToHtml', () => {
  test('CSF3: reads component from the default export and merges meta + story args', async () => {
    const { runtime, renderAstroStory } = createRuntime({
      default: { component: ButtonAstro, args: { label: 'Meta', size: 'lg' } },
      Primary: { args: { label: 'Primary' } }
    });

    const html = await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    expect(html).toBe('<button>rendered</button>');
    expect(renderAstroStory).toHaveBeenCalledWith(
      expect.objectContaining({
        component: '/project/src/Button.astro',
        args: { label: 'Primary', size: 'lg' }
      })
    );
  });

  test('CSF4 factory: reads component and args from the story export meta with no default export', async () => {
    const { runtime, renderAstroStory } = createRuntime({
      // Shape produced by `meta.story()` in Storybook's CSF factories.
      Primary: {
        _tag: 'Story',
        input: { args: { label: 'Primary' } },
        meta: {
          _tag: 'Meta',
          input: { component: ButtonAstro, args: { label: 'Meta', size: 'lg' } }
        }
      }
    });

    const html = await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    expect(html).toBe('<button>rendered</button>');
    expect(renderAstroStory).toHaveBeenCalledWith(
      expect.objectContaining({
        component: '/project/src/Button.astro',
        args: { label: 'Primary', size: 'lg' }
      })
    );
  });

  test('skips stories that override the component with a non-Astro render', async () => {
    function OtherComponent() {
      return '';
    }

    const { runtime, renderAstroStory } = createRuntime({
      default: { component: ButtonAstro },
      Primary: { component: OtherComponent }
    });

    const html = await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    expect(html).toBeUndefined();
    expect(renderAstroStory).not.toHaveBeenCalled();
  });

  test('an undecorated story omits `node` entirely, keeping today\'s render call unchanged', async () => {
    const { runtime, renderAstroStory } = createRuntime({
      default: { component: ButtonAstro, args: { label: 'Meta' } },
      Primary: {}
    });

    await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    const callArgs = renderAstroStory.mock.calls[0][0] as Record<string, unknown>;

    expect('node' in callArgs).toBe(false);
  });

  test('a decorated story forwards the composed tree as `node` alongside the existing args/slots', async () => {
    const wrapperTree = { component: ButtonAstro, props: { label: 'Wrapper' }, slots: { default: ButtonAstro } };
    const { runtime, renderAstroStory } = createRuntime(
      {
        default: { component: ButtonAstro, args: { label: 'Meta', size: 'lg' } },
        Primary: { args: { label: 'Primary' } }
      },
      async () => ({ node: wrapperTree, skippedDecorators: [] })
    );

    const html = await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    expect(html).toBe('<button>rendered</button>');
    expect(renderAstroStory).toHaveBeenCalledWith(
      expect.objectContaining({
        component: '/project/src/Button.astro',
        args: { label: 'Primary', size: 'lg' },
        node: wrapperTree
      })
    );
  });

  test('drops the story (and logs why) when decorator composition throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, renderAstroStory } = createRuntime(
      {
        default: { component: ButtonAstro },
        Primary: {}
      },
      async () => {
        throw new Error('boom');
      }
    );

    const html = await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    expect(html).toBeUndefined();
    expect(renderAstroStory).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));

    warnSpy.mockRestore();
  });

  test('prerenders the story with the decorators that composed, and warns about the one it skipped (issue #413)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapperTree = { component: ButtonAstro, slots: { default: ButtonAstro } };
    const { runtime, renderAstroStory } = createRuntime(
      {
        default: { component: ButtonAstro, args: { label: 'Meta' } },
        Primary: {}
      },
      async () => ({
        node: wrapperTree,
        skippedDecorators: [{ error: new ReferenceError('window is not defined'), missingGlobal: 'window' }]
      })
    );

    const html = await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    expect(html).toBe('<button>rendered</button>');
    expect(renderAstroStory).toHaveBeenCalledWith(expect.objectContaining({ node: wrapperTree }));
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const [warning] = warnSpy.mock.calls[0] as [string];

    expect(warning).toContain('components-button--primary');
    expect(warning).toContain('without a decorator that uses a browser-only global');
    expect(warning).toContain('window is not defined');
    expect(warning).toContain("typeof window !== 'undefined'");

    warnSpy.mockRestore();
  });

  test('drops the story when a browser-global error escapes composition, as from the story\'s own render', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, renderAstroStory } = createRuntime(
      {
        default: { component: ButtonAstro },
        Primary: {}
      },
      async () => {
        throw new ReferenceError('document is not defined');
      }
    );

    const html = await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    expect(html).toBeUndefined();
    expect(renderAstroStory).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Dropped story'));

    warnSpy.mockRestore();
  });
});

describe('findMissingBrowserGlobal', () => {
  test.each([
    ['document is not defined', 'document'],
    ['innerWidth is not defined', 'innerWidth'],
    ['history is not defined', 'history'],
    ['self is not defined', 'self'],
    ['HTMLDivElement is not defined', 'HTMLDivElement'],
    ['SVGDocument is not defined', 'SVGDocument'],
    ['KeyboardEvent is not defined', 'KeyboardEvent'],
    ['DocumentFragment is not defined', 'DocumentFragment'],
    ['formatLabel is not defined', undefined],
    ['trackEvent is not defined', undefined],
    // Names a project imports itself, so a missing import is a real bug.
    ['Image is not defined', undefined],
    ['Node is not defined', undefined],
    ['TrackingEvent is not defined', undefined]
  ])('%s → %s', (message, expected) => {
    expect(findMissingBrowserGlobal(new ReferenceError(message))).toBe(expected);
  });

  test('ignores errors other than a ReferenceError', () => {
    expect(findMissingBrowserGlobal(new TypeError('document is not defined'))).toBeUndefined();
  });
});

// The issue #413 setup end to end: a classic preview.ts that imports from
// addon-docs (stubbed in the prerender since #410) and registers a global
// decorator, prerendered through the real SSR runtime.
describe('createProductionRenderRuntime with a project preview', () => {
  async function prerenderWithPreviewDecorators(
    decoratorsSource: string,
    storySource = 'export const Primary = {};'
  ) {
    // Inside the package (not the OS tmpdir) so `astro` resolves by walking up.
    const packageDir = fileURLToPath(new URL('..', import.meta.url));
    const fixtureDir = await mkdtemp(join(packageDir, '.vitest-prerender-fixture-'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await writeFile(
        join(fixtureDir, 'package.json'),
        JSON.stringify({ name: 'prerender-fixture', type: 'module', private: true })
      );
      await writeFile(join(fixtureDir, 'astro.config.mjs'), 'export default {};');
      await mkdir(join(fixtureDir, '.storybook'));
      await writeFile(
        join(fixtureDir, '.storybook', 'preview.ts'),
        `import { Meta } from '@storybook/addon-docs/blocks';
        import Wrapper from '../Wrapper.astro';

        export default {
          blocks: [Meta],
          decorators: [${decoratorsSource}]
        };`
      );
      await writeFile(join(fixtureDir, 'Wrapper.astro'), '<section class="wrapper"><slot /></section>');
      await writeFile(join(fixtureDir, 'Button.astro'), '<button>{Astro.props.label}</button>');
      await writeFile(
        join(fixtureDir, 'Button.stories.ts'),
        `import Button from './Button.astro';

        export default { component: Button, args: { label: 'Prerendered' } };
        ${storySource}`
      );

      const runtime = await createProductionRenderRuntime({
        integrations: [],
        staticModuleMap: {},
        trackedSpecifiers: new Set(),
        resolveFrom: fixtureDir
      });

      try {
        const html = await renderProductionStoryToHtml({
          story: {
            id: 'button--primary',
            importPath: './Button.stories.ts',
            componentPath: './Button.astro',
            exportName: 'Primary'
          },
          runtime,
          resolveFrom: fixtureDir
        });

        return { html, warnings: warnSpy.mock.calls.map(([message]) => String(message)) };
      } finally {
        await runtime.close();
      }
    } finally {
      warnSpy.mockRestore();
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }

  test('skips a global decorator that reads `document`, with a warning, and prerenders the story', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorators(
      '(Story) => { document.title; return Story(); }'
    );

    expect(html).toContain('<button');
    expect(html).toContain('Prerendered');

    const storyWarnings = warnings.filter((message) => message.includes('button--primary'));

    expect(storyWarnings).toHaveLength(1);
    expect(storyWarnings[0]).toContain('without a decorator that uses a browser-only global');
    expect(storyWarnings[0]).toContain('document is not defined');
    expect(storyWarnings[0]).toContain("typeof document !== 'undefined'");
  }, 60_000);

  test('keeps a Node-safe wrapper decorator when the global decorator beside it reads `window`', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorators(
      "(Story) => { window.matchMedia('(prefers-color-scheme: dark)'); return Story(); }, () => ({ component: Wrapper })"
    );

    expect(html).toMatch(/<section class="wrapper"[^>]*>\s*<button[^>]*>Prerendered<\/button>/);

    const storyWarnings = warnings.filter((message) => message.includes('button--primary'));

    expect(storyWarnings).toHaveLength(1);
    expect(storyWarnings[0]).toContain('window is not defined');
  }, 60_000);

  test('skips a CSF2 function story\'s own decorator that reads `document`', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorators(
      '() => ({ component: Wrapper })',
      `export const Primary = (args, { component }) => component;
      Primary.decorators = [(Story) => { document.title; return Story(); }];`
    );

    expect(html).toMatch(/<section class="wrapper"[^>]*>\s*<button[^>]*>Prerendered<\/button>/);

    const storyWarnings = warnings.filter((message) => message.includes('button--primary'));

    expect(storyWarnings).toHaveLength(1);
    expect(storyWarnings[0]).toContain('document is not defined');
  }, 60_000);

  test('prerenders a story whose `decorators` is null, as Storybook normalizes it to none', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorators(
      '() => ({ component: Wrapper })',
      'export const Primary = { decorators: null };'
    );

    expect(html).toMatch(/<section class="wrapper"[^>]*>\s*<button[^>]*>Prerendered<\/button>/);
    expect(warnings.filter((message) => message.includes('button--primary'))).toHaveLength(0);
  }, 60_000);

  test('drops the story when its own render reads `document`', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorators(
      '() => ({ component: Wrapper })',
      'export const Primary = { render: () => document.title };'
    );

    expect(html).toBeUndefined();
    expect(warnings).toContainEqual(expect.stringContaining('Dropped story "button--primary"'));
  }, 60_000);

  test('drops the story when a global decorator throws an error unrelated to the DOM', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorators(
      "() => { throw new Error('decorator bug'); }"
    );

    expect(html).toBeUndefined();
    expect(warnings).toContainEqual(expect.stringContaining('Dropped story "button--primary"'));
  }, 60_000);

  test('applies a global decorator that runs under Node', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorators(
      '() => ({ component: Wrapper })'
    );

    expect(html).toMatch(/<section class="wrapper"[^>]*>\s*<button[^>]*>Prerendered<\/button>/);
    expect(warnings.filter((message) => message.includes('button--primary'))).toHaveLength(0);
  }, 60_000);
});
