import { describe, expect, test, vi } from 'vitest';
import {
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

function createRuntime(storyModule: Record<string, unknown>): {
  runtime: ProductionRenderRuntime;
  renderAstroStory: ReturnType<typeof vi.fn>;
} {
  const renderAstroStory = vi.fn(async () => '<button>rendered</button>');

  return {
    runtime: {
      loadModule: async () => storyModule,
      renderAstroStory,
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
});
