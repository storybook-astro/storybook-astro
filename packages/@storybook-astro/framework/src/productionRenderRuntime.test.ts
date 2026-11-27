import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import {
  createProductionRenderRuntime,
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
  composeDecoratedTree: ProductionRenderRuntime['composeDecoratedTree'] = async () => undefined
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
      async () => wrapperTree
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

  test('prerenders the story without its decorators (and logs why) when a decorator reads a browser-only global (issue #413)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, renderAstroStory } = createRuntime(
      {
        default: { component: ButtonAstro, args: { label: 'Meta' } },
        Primary: {}
      },
      async () => {
        throw new ReferenceError('document is not defined');
      }
    );

    const html = await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    expect(html).toBe('<button>rendered</button>');

    const callArgs = renderAstroStory.mock.calls[0][0] as Record<string, unknown>;

    expect(callArgs).toMatchObject({ component: '/project/src/Button.astro', args: { label: 'Meta' } });
    expect('node' in callArgs).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('components-button--primary'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('document is not defined'));

    warnSpy.mockRestore();
  });

  test('still drops the story when a decorator references an undefined name that is not a browser global', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, renderAstroStory } = createRuntime(
      {
        default: { component: ButtonAstro },
        Primary: {}
      },
      async () => {
        throw new ReferenceError('formatLabel is not defined');
      }
    );

    const html = await renderProductionStoryToHtml({ story, runtime, resolveFrom });

    expect(html).toBeUndefined();
    expect(renderAstroStory).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Dropped story'));

    warnSpy.mockRestore();
  });
});

// The issue #413 setup end to end: a classic preview.ts that imports from
// addon-docs (stubbed in the prerender since #410) and registers a global
// decorator, prerendered through the real SSR runtime.
describe('createProductionRenderRuntime with a project preview', () => {
  async function prerenderWithPreviewDecorator(decoratorSource: string) {
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
          decorators: [${decoratorSource}]
        };`
      );
      await writeFile(join(fixtureDir, 'Wrapper.astro'), '<section class="wrapper"><slot /></section>');
      await writeFile(join(fixtureDir, 'Button.astro'), '<button>{Astro.props.label}</button>');
      await writeFile(
        join(fixtureDir, 'Button.stories.ts'),
        `import Button from './Button.astro';

        export default { component: Button, args: { label: 'Prerendered' } };
        export const Primary = {};`
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

  test('prerenders the story undecorated, with a warning, when a global decorator reads `document`', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorator(
      '(Story) => { document.title; return Story(); }'
    );

    expect(html).toContain('<button');
    expect(html).toContain('Prerendered');

    const storyWarnings = warnings.filter((message) => message.includes('button--primary'));

    expect(storyWarnings).toHaveLength(1);
    expect(storyWarnings[0]).toContain('without its decorators');
    expect(storyWarnings[0]).toContain('document is not defined');
  }, 60_000);

  test('drops the story when a global decorator throws an error unrelated to the DOM', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorator(
      "() => { throw new Error('decorator bug'); }"
    );

    expect(html).toBeUndefined();
    expect(warnings).toContainEqual(expect.stringContaining('Dropped story "button--primary"'));
  }, 60_000);

  test('applies a global decorator that runs under Node', async () => {
    const { html, warnings } = await prerenderWithPreviewDecorator(
      '() => ({ component: Wrapper })'
    );

    expect(html).toMatch(/<section class="wrapper"[^>]*>\s*<button[^>]*>Prerendered<\/button>/);
    expect(warnings.filter((message) => message.includes('button--primary'))).toHaveLength(0);
  }, 60_000);
});
