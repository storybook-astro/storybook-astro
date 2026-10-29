import { describe, test, expect, vi } from 'vitest';
import { ASTRO_COMPONENT_MARKER } from '@storybook-astro/renderer/types';
import { createAstroRenderHandler, processImageMetadata } from './astroRenderHandler.ts';
import type { SanitizationOptions } from './lib/sanitization.ts';
import type { ComponentStyles } from './lib/componentStyles.ts';

// In the static-build/testing path, story args arrive as real JS objects (no
// JSON transport), so a Date reaches processImageMetadata as an actual Date.
// It must survive: walking it with Object.entries would flatten it to {}, which
// surfaced as "Invalid time value" when a component formatted the date.
test('processImageMetadata preserves a nested Date instead of flattening it', async () => {
  const date = new Date('2022-04-04T05:00:00.000Z');

  const result = await processImageMetadata({
    post: { data: { title: 'Hello', date } },
  });

  const preserved = (result.post as { data: { date: unknown } }).data.date;

  expect(preserved).toBeInstanceOf(Date);
  expect((preserved as Date).toISOString()).toBe('2022-04-04T05:00:00.000Z');
});

test('processImageMetadata preserves Dates inside arrays', async () => {
  const result = await processImageMetadata({
    posts: [{ data: { date: new Date('2022-04-04T05:00:00.000Z') } }],
  });

  const preserved = (result.posts as Array<{ data: { date: unknown } }>)[0].data.date;

  expect(preserved).toBeInstanceOf(Date);
});

test('processImageMetadata still recurses into plain objects', async () => {
  const result = await processImageMetadata({ nested: { keep: 'value', n: 1 } });

  expect(result.nested).toEqual({ keep: 'value', n: 1 });
});

// --- Decorator root node (`node`) — Decorator Support, Step 3 -------------
//
// A fake Astro Container: `renderToString` records the component/props/slots
// it was called with and returns a small, deterministic HTML fragment so tests
// can assert on the final assembled string without a real Astro build. A fake
// `loadModule` resolves a moduleId to one of `components`, the same way the
// dev/server transports load a story or decorator component from disk.
// moduleIds here are deliberately bare (no leading slash) so the generated
// fragments below read cleanly as plain strings.

const marker = (moduleId: string) => ({ [ASTRO_COMPONENT_MARKER]: true as const, moduleId });

function fakeComponent(moduleId: string) {
  const factory = (() => undefined) as unknown as (() => undefined) & {
    isAstroComponentFactory: true;
    moduleId: string;
  };

  factory.isAstroComponentFactory = true;
  factory.moduleId = moduleId;

  return factory;
}

type FakeRenderToString = (
  component: { moduleId?: string },
  opts: { props?: Record<string, unknown>; slots?: Record<string, unknown> }
) => Promise<string>;

/** `<moduleId props="...">slotHtml</moduleId>` — deterministic and easy to assert on. */
const defaultRenderToString: FakeRenderToString = async (component, opts) => {
  const moduleId = component.moduleId ?? 'unknown';
  const slotHtml = Object.values(opts.slots ?? {}).join('');

  return `<${moduleId} props="${JSON.stringify(opts.props ?? {})}">${slotHtml}</${moduleId}>`;
};

function createHandler(options: {
  components: Record<string, unknown>;
  sanitization?: SanitizationOptions;
  renderToString?: FakeRenderToString;
  loadComponentStyles?: (componentIds: string[]) => Promise<ComponentStyles>;
  failOnStyleError?: boolean;
}) {
  const renderToString = vi.fn(options.renderToString ?? defaultRenderToString);
  const loadModule = vi.fn(async (id: string) => ({ default: options.components[id] }));

  const handler = createAstroRenderHandler({
    container: { renderToString } as unknown as Parameters<typeof createAstroRenderHandler>[0]['container'],
    sanitization: options.sanitization,
    loadModule,
    loadComponentStyles: options.loadComponentStyles,
    failOnStyleError: options.failOnStyleError
  });

  return { handler, renderToString };
}

describe('createAstroRenderHandler — node absent (regression)', () => {
  test('renders the plain story exactly as it did before Step 3', async () => {
    const { handler } = createHandler({ components: { 'Button.astro': fakeComponent('Button.astro') } });

    const html = await handler({
      component: 'Button.astro',
      args: { label: 'Hi' },
      slots: { default: '<b>x</b>' }
    });

    expect(html).toBe('<Button.astro props="{"label":"Hi"}"><b>x</b></Button.astro>');
  });
});

describe('createAstroRenderHandler — resolving a decorator root node', () => {
  test('resolves a two-level nested descriptor chain, innermost story first', async () => {
    const { handler, renderToString } = createHandler({
      components: {
        'Layout.astro': fakeComponent('Layout.astro'),
        'Card.astro': fakeComponent('Card.astro'),
        'Story.astro': fakeComponent('Story.astro')
      }
    });

    const node = {
      component: marker('Layout.astro'),
      slots: {
        default: {
          component: marker('Card.astro'),
          props: { title: 'Card title' },
          slots: { default: marker('Story.astro') }
        }
      }
    };

    const html = await handler({
      component: 'Story.astro',
      args: { label: 'From story args' },
      slots: {},
      node
    });

    // Innermost (the story) renders before its parent, whose slot content is
    // then available when the parent itself renders — the existing
    // configured-component-slot machinery's order, reused for the root.
    const moduleIds = renderToString.mock.calls.map(([component]) => (component as { moduleId?: string }).moduleId);

    expect(moduleIds).toEqual(['Story.astro', 'Card.astro', 'Layout.astro']);

    // The story keeps its own top-level args as props, wherever it sits in the
    // tree — not the empty props a bare slot leaf would otherwise get.
    expect(html).toBe(
      '<Layout.astro props="{}">' +
        '<Card.astro props="{"title":"Card title"}">' +
        '<Story.astro props="{"label":"From story args"}"></Story.astro>' +
        '</Card.astro>' +
        '</Layout.astro>'
    );
  });

  test('resolves an array root — the split form of a string decorator', async () => {
    const { handler } = createHandler({
      components: { 'Story.astro': fakeComponent('Story.astro') }
    });

    const node = ['<div class="wrap">', marker('Story.astro'), '</div>'];

    const html = await handler({ component: 'Story.astro', args: {}, slots: {}, node });

    expect(html).toBe('<div class="wrap"><Story.astro props="{}"></Story.astro></div>');
  });

  test('runs the story leaf’s render through its own already-processed args/slots, not empty props', async () => {
    const { handler, renderToString } = createHandler({
      components: {
        'Wrapper.astro': fakeComponent('Wrapper.astro'),
        'Story.astro': fakeComponent('Story.astro')
      }
    });

    const node = { component: marker('Wrapper.astro'), slots: { default: marker('Story.astro') } };

    await handler({
      component: 'Story.astro',
      args: { title: 'Hello' },
      slots: { footer: '<p>footer</p>' },
      node
    });

    const storyCall = renderToString.mock.calls.find(
      ([component]) => (component as { moduleId?: string }).moduleId === 'Story.astro'
    );
    const storySlots = storyCall?.[1].slots as Record<string, unknown>;

    expect(storyCall?.[1].props).toEqual({ title: 'Hello' });
    // `markRawSlots` wraps string slots in Astro's `HTMLString` — compare by
    // content, not structural equality.
    expect(String(storySlots.footer)).toBe('<p>footer</p>');
  });

  // Server mode loads components from a deployed snapshot at a different path
  // than the client-sent moduleId (`resolveSnapshotComponentPath` in
  // `server/index.ts`), so Astro's compiler embeds `.moduleId` from the
  // *snapshot* path on the loaded factory — not the original id the request
  // carries as `component`/the marker's `moduleId`. The story leaf must still
  // be recognized by *which load it came from*, not by comparing that embedded
  // `.moduleId` string against the request's `component`.
  test('recognizes the story leaf even when the loaded component reports a different moduleId (server-mode snapshot remap)', async () => {
    // The loaded factory's own `.moduleId` (as Astro's compiler embedded it while
    // compiling the snapshot copy) deliberately differs from the request's
    // `component`/marker moduleId, simulating `resolveSnapshotComponentPath`.
    const snapshotStoryFactory = fakeComponent('/snapshot/project/Story.astro');
    const loadModule = vi.fn(async (id: string) => ({
      default: id === 'Wrapper.astro' ? fakeComponent('Wrapper.astro') : snapshotStoryFactory
    }));
    const renderToString = vi.fn(defaultRenderToString);
    const handler = createAstroRenderHandler({
      container: { renderToString } as unknown as Parameters<typeof createAstroRenderHandler>[0]['container'],
      loadModule
    });

    const node = { component: marker('Wrapper.astro'), slots: { default: marker('Story.astro') } };

    await handler({
      component: 'Story.astro',
      args: { title: 'Hello' },
      slots: {},
      node
    });

    const storyCall = renderToString.mock.calls.find(
      ([component]) => (component as { moduleId?: string }).moduleId === snapshotStoryFactory.moduleId
    );

    expect(storyCall?.[1].props).toEqual({ title: 'Hello' });
  });
});

describe('createAstroRenderHandler — decorator security boundary', () => {
  test('strips a <script> in a user-authored wrapper string', async () => {
    const { handler } = createHandler({
      components: { 'Story.astro': fakeComponent('Story.astro') }
    });

    const node = ['<div class="wrap"><script>alert(1)</script>', marker('Story.astro'), '</div>'];

    const html = await handler({ component: 'Story.astro', args: {}, slots: {}, node });

    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('<script>');
  });

  test('splices server-rendered component HTML (script tags, custom elements) in untouched', async () => {
    const trustedComponentHtml =
      '<button data-astro-cid-abc123><script>doThing()</script><astro-island></astro-island></button>';

    const { handler } = createHandler({
      components: { 'Story.astro': fakeComponent('Story.astro') },
      renderToString: async () => trustedComponentHtml
    });

    const node = ['<div class="wrap">', marker('Story.astro'), '</div>'];

    const html = await handler({ component: 'Story.astro', args: {}, slots: {}, node });

    expect(html).toContain('<script>doThing()</script>');
    expect(html).toContain('<astro-island></astro-island>');
    expect(html).toContain('data-astro-cid-abc123');
  });

  test('keeps a wrapper tag balanced across array entries around the rendered component', async () => {
    const { handler } = createHandler({
      components: { 'Story.astro': fakeComponent('Story.astro') },
      renderToString: async () => '<b>story</b>'
    });

    const node = ['<div class="wrap">', marker('Story.astro'), '</div>'];

    const html = await handler({ component: 'Story.astro', args: {}, slots: {}, node });

    // A per-entry sanitize pass would auto-close '<div class="wrap">' on its
    // own and discard the orphan '</div>' (#149) — this proves the wrapper
    // stays balanced around the trusted, spliced-in component HTML.
    expect(html).toBe('<div class="wrap"><b>story</b></div>');
  });
});

describe('createAstroRenderHandler — wrapper props pipeline', () => {
  test('runs a wrapper descriptor’s own props through reconstructProps + processImageMetadata + reviveDateStrings', async () => {
    const { handler, renderToString } = createHandler({
      components: {
        'Wrapper.astro': fakeComponent('Wrapper.astro'),
        'Icon.astro': fakeComponent('Icon.astro'),
        'Story.astro': fakeComponent('Story.astro')
      }
    });

    const node = {
      component: marker('Wrapper.astro'),
      props: {
        // A component-as-prop marker: must resolve to the real factory, not
        // stay a plain marker object, exactly like a top-level story arg does.
        Icon: marker('Icon.astro'),
        // A JSON-serialized Date: must revive to a real Date instance.
        publishedAt: '2022-04-04T05:00:00.000Z'
      },
      slots: { default: marker('Story.astro') }
    };

    await handler({ component: 'Story.astro', args: {}, slots: {}, node });

    const wrapperCall = renderToString.mock.calls.find(
      ([component]) => (component as { moduleId?: string }).moduleId === 'Wrapper.astro'
    );
    const wrapperProps = wrapperCall?.[1].props as { Icon: unknown; publishedAt: unknown };

    expect(typeof wrapperProps.Icon).toBe('function');
    expect((wrapperProps.Icon as { moduleId?: string }).moduleId).toBe('Icon.astro');
    expect(wrapperProps.publishedAt).toBeInstanceOf(Date);
    expect((wrapperProps.publishedAt as Date).toISOString()).toBe('2022-04-04T05:00:00.000Z');
  });
});

describe('createAstroRenderHandler — malformed node rejected', () => {
  test('rejects a node that is not a valid SlotValue shape', async () => {
    const { handler } = createHandler({ components: { 'Story.astro': fakeComponent('Story.astro') } });

    await expect(
      handler({ component: 'Story.astro', args: {}, slots: {}, node: 42 as never })
    ).rejects.toThrow(/not a valid decorator node/);
  });

  test('rejects a descriptor whose props is not a plain object', async () => {
    const { handler } = createHandler({ components: { 'Story.astro': fakeComponent('Story.astro') } });

    const node = { component: marker('Story.astro'), props: 'not an object' as never };

    await expect(handler({ component: 'Story.astro', args: {}, slots: {}, node })).rejects.toThrow(
      /props must be a plain object/
    );
  });
});

describe('createAstroRenderHandler — depth cap', () => {
  test('fails loudly instead of silently truncating when nesting exceeds the maximum depth', async () => {
    const components: Record<string, unknown> = { 'Story.astro': fakeComponent('Story.astro') };

    // Build a chain of wrapper descriptors deeper than MAX_DEPTH (10).
    let node: unknown = marker('Story.astro');

    for (let level = 0; level < 12; level += 1) {
      const moduleId = `Wrapper${level}.astro`;

      components[moduleId] = fakeComponent(moduleId);
      node = { component: marker(moduleId), slots: { default: node } };
    }

    const { handler } = createHandler({ components });

    await expect(
      handler({ component: 'Story.astro', args: {}, slots: {}, node: node as never })
    ).rejects.toThrow(/maximum node depth/);
  });
});

// --- Scoped component styles (issue #189) ----------------------------------

describe('createAstroRenderHandler — component styles', () => {
  const stylesNamingEachComponent = async (ids: string[]): Promise<ComponentStyles> => ({
    stylesheets: ids.map((id) => `/* ${id} */`),
    failures: []
  });

  test('ships the CSS of every component the story used, decorators first, ahead of the HTML', async () => {
    const loadComponentStyles = vi.fn(stylesNamingEachComponent);
    const { handler } = createHandler({
      components: {
        'Panel.astro': fakeComponent('Panel.astro'),
        'Badge.astro': fakeComponent('Badge.astro'),
        'Wrapper.astro': fakeComponent('Wrapper.astro')
      },
      loadComponentStyles
    });

    const html = await handler({
      component: 'Panel.astro',
      // A real factory, as the static build passes it straight from the story module.
      args: { Icon: fakeComponent('Icon.astro') },
      // A marker, as the browser sends it.
      slots: { default: marker('Badge.astro') },
      node: { component: marker('Wrapper.astro'), slots: { default: marker('Panel.astro') } }
    });

    // The decorator wraps the story like a layout wraps a page, so the story's
    // CSS comes after the decorator's, as a page's does after its layout's.
    expect(loadComponentStyles).toHaveBeenCalledWith(['Wrapper.astro', 'Panel.astro', 'Icon.astro', 'Badge.astro']);
    expect(html).toMatch(
      /^(<style data-storybook-astro-styles>\/\* \w+\.astro \*\/<\/style>){4}<Wrapper\.astro/
    );
  });

  test('adds no style tag when the components have no styles', async () => {
    const { handler } = createHandler({
      components: { 'Button.astro': fakeComponent('Button.astro') },
      loadComponentStyles: async () => ({ stylesheets: [], failures: [] })
    });

    const html = await handler({ component: 'Button.astro' });

    expect(html).not.toContain('<style');
  });

  test('ships the styles that loaded and warns about the ones that failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const brokenBlock = new Error('No Astro CSS at index 1');

    try {
      const { handler } = createHandler({
        components: { 'Button.astro': fakeComponent('Button.astro') },
        loadComponentStyles: async () => ({
          stylesheets: ['.button { color: red; }'],
          failures: [{ moduleId: 'Button.astro?astro&type=style&index=1&lang.css', error: brokenBlock }]
        })
      });

      const html = await handler({ component: 'Button.astro' });

      expect(html).toMatch(/^<style data-storybook-astro-styles>\.button \{ color: red; \}<\/style><Button\.astro/);
      expect(warn).toHaveBeenCalledWith(
        '[storybook-astro] Could not load styles for Button.astro?astro&type=style&index=1&lang.css:',
        brokenBlock
      );
    } finally {
      warn.mockRestore();
    }
  });

  test('still shows the story, unstyled, when loading styles throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const { handler } = createHandler({
        components: { 'Button.astro': fakeComponent('Button.astro') },
        loadComponentStyles: async () => {
          throw new Error('module graph unavailable');
        }
      });

      expect(await handler({ component: 'Button.astro' })).toMatch(/^<Button\.astro/);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  test('fails the render in a static build, naming each module whose styles failed', async () => {
    const { handler } = createHandler({
      components: { 'Button.astro': fakeComponent('Button.astro') },
      loadComponentStyles: async () => ({
        stylesheets: ['.button { color: red; }'],
        failures: [
          { moduleId: 'Button.astro?astro&type=style&index=1&lang.scss', error: new Error('Sass syntax error') },
          { moduleId: 'Icon.astro', error: new Error('not in the SSR module graph') }
        ]
      }),
      failOnStyleError: true
    });

    await expect(handler({ component: 'Button.astro' })).rejects.toThrow(
      '[storybook-astro] Could not load component styles:\n' +
        '- Button.astro?astro&type=style&index=1&lang.scss: Sass syntax error\n' +
        '- Icon.astro: not in the SSR module graph'
    );
  });

  test('a "</style" inside the CSS does not end the style tag early', async () => {
    const { handler } = createHandler({
      components: { 'Button.astro': fakeComponent('Button.astro') },
      loadComponentStyles: async () => ({ stylesheets: ['.button::after { content: "</style>"; }'], failures: [] })
    });

    const html = await handler({ component: 'Button.astro' });

    expect(html).toContain('content: "<\\/style>"; }</style><Button.astro');
    expect(html.match(/<\/style>/g)).toHaveLength(1);
  });

  function createMockingHandler() {
    const loadModule = vi.fn(async (id: string) => ({ default: fakeComponent(id) }));
    const invalidateModuleGraph = vi.fn();
    const handler = createAstroRenderHandler({
      container: { renderToString: vi.fn(defaultRenderToString) } as unknown as Parameters<
        typeof createAstroRenderHandler
      >[0]['container'],
      loadModule,
      invalidateModuleGraph,
      resolveRulesConfigModule: () => ({
        rules: [{ match: 'card--mocked', use: ({ mock }: { mock: (id: string, factory: () => object) => void }) => mock('./data.ts', () => ({})) }]
      }),
      loadComponentStyles: stylesNamingEachComponent
    });
    const render = (storyId: string, request: Partial<Parameters<typeof handler>[0]> = {}) =>
      handler({ component: 'Card.astro', story: { id: storyId, title: 'Card', name: storyId }, ...request });

    return { loadModule, invalidateModuleGraph, render };
  }

  test('restores the real modules after a story with module mocks, for whichever handler renders next', async () => {
    // The modules a mocked render loads import the mocks. The module graph
    // outlives the handler (dev makes a new one on every file change), so it
    // is reset as soon as the mocked render ends.
    const { loadModule, invalidateModuleGraph, render } = createMockingHandler();

    await render('card--real');
    await render('card--mocked');

    expect(invalidateModuleGraph).toHaveBeenCalledTimes(2);

    // The next story reloads its components, so it and its styles come from
    // the real modules. After that, renders use the cache again.
    loadModule.mockClear();
    await render('card--real');
    expect(loadModule).toHaveBeenCalledWith('Card.astro');

    loadModule.mockClear();
    await render('card--real');
    expect(loadModule).not.toHaveBeenCalled();
    expect(invalidateModuleGraph).toHaveBeenCalledTimes(2);
  });

  test('a mocked story\'s decorators load with the mocks, and the next story does not reuse them', async () => {
    const { loadModule, render } = createMockingHandler();
    const node = { component: marker('Wrapper.astro'), slots: { default: marker('Card.astro') } };

    await render('card--real', { node });
    loadModule.mockClear();
    await render('card--mocked', { node });
    expect(loadModule).toHaveBeenCalledWith('Wrapper.astro');

    loadModule.mockClear();
    await render('card--real', { node });
    expect(loadModule).toHaveBeenCalledWith('Wrapper.astro');
  });
});
