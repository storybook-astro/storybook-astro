import { describe, test, expect, vi, beforeEach } from 'vitest';

const emitTransformCode = vi.fn();

// `useEffect` runs the callback immediately here — the decorator's emission is
// what we're asserting on, not Storybook's effect scheduling.
vi.mock('storybook/internal/preview-api', () => ({
  emitTransformCode: (...args: unknown[]) => emitTransformCode(...args),
  useEffect: (fn: () => void) => fn()
}));

const { sourceDecorator } = await import('./sourceDecorator.ts');

/** A stand-in for the client stub `vitePluginAstroComponentMarker` produces. */
function astroStub(moduleId: string, displayName?: string) {
  const stub = () => {};

  Object.assign(stub, {
    isAstroComponentFactory: true,
    moduleId,
    ...(displayName ? { __docgenInfo: { displayName } } : {})
  });

  return stub;
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    component: astroStub('/src/components/Card.astro', 'Card'),
    title: 'Astro/Card',
    args: { title: 'Hello' },
    ...overrides,
    parameters: {
      __isArgsStory: true,
      renderer: 'astro',
      fileName: '/src/components/Card.stories.jsx',
      ...(overrides.parameters as Record<string, unknown> | undefined)
    }
  } as never;
}

const storyFn = () => 'story-result';

beforeEach(() => emitTransformCode.mockClear());

describe('emitting Astro source', () => {
  test('emits component usage for an Astro args story', () => {
    sourceDecorator(storyFn, context());

    expect(emitTransformCode).toHaveBeenCalledTimes(1);
    expect(emitTransformCode.mock.calls[0][0]).toBe(
      ["---", "import Card from './Card.astro';", '---', '<Card title="Hello" />'].join('\n')
    );
  });

  test('returns the story untouched', () => {
    expect(sourceDecorator(storyFn, context())).toBe('story-result');
  });

  test('prefers the docgen displayName over the filename', () => {
    sourceDecorator(
      storyFn,
      context({ component: astroStub('/src/components/Card.astro', 'HeroHijri') })
    );

    expect(emitTransformCode.mock.calls[0][0]).toContain('<HeroHijri title="Hello" />');
  });
});

describe('the objectProps parameter', () => {
  test('writes object props inline when set to inline (issue #190)', () => {
    sourceDecorator(
      storyFn,
      context({ args: { media: { src: '/a.png' } }, parameters: { docs: { source: { objectProps: 'inline' } } } })
    );

    expect(emitTransformCode.mock.calls[0][0]).toContain('media={{');
    expect(emitTransformCode.mock.calls[0][0]).not.toContain('const media');
  });

  test('keeps them in the frontmatter by default', () => {
    sourceDecorator(storyFn, context({ args: { media: { src: '/a.png' } } }));

    expect(emitTransformCode.mock.calls[0][0]).toContain('const media = {');
  });
});

describe('args the snippet cannot print (issue #273)', () => {
  test('an arg that throws while being read skips the snippet without breaking the story', () => {
    const args = {
      get broken() {
        throw new Error('getter failed');
      }
    };

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      expect(sourceDecorator(storyFn, context({ args }))).toBe('story-result');
      expect(emitTransformCode).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Show code skipped'),
        expect.any(Error)
      );
    } finally {
      warn.mockRestore();
    }
  });

  test('a Symbol or circular arg is left out and the rest still emits', () => {
    const loop: Record<string, unknown> = {};

    loop.self = loop;
    sourceDecorator(storyFn, context({ args: { title: 'Hello', tag: Symbol('t'), loop } }));

    expect(emitTransformCode.mock.calls[0][0]).toContain('<Card title="Hello" />');
  });
});

describe('skipping', () => {
  test('a story with docs.source.code set — the documented workaround wins', () => {
    sourceDecorator(storyFn, context({ parameters: { docs: { source: { code: 'custom' } } } }));

    expect(emitTransformCode).not.toHaveBeenCalled();
  });

  test('a custom-render story, which has no args to describe', () => {
    sourceDecorator(storyFn, context({ parameters: { __isArgsStory: false } }));

    expect(emitTransformCode).not.toHaveBeenCalled();
  });

  test('a framework-delegated story', () => {
    sourceDecorator(storyFn, context({ parameters: { renderer: 'react' } }));

    expect(emitTransformCode).not.toHaveBeenCalled();
  });

  test('a story whose component is not an Astro stub', () => {
    sourceDecorator(storyFn, context({ component: () => {} }));

    expect(emitTransformCode).not.toHaveBeenCalled();
  });

  test('docs.source.type CODE', () => {
    sourceDecorator(storyFn, context({ parameters: { docs: { source: { type: 'code' } } } }));

    expect(emitTransformCode).not.toHaveBeenCalled();
  });

  test('but DYNAMIC forces emission even for a non-args story', () => {
    sourceDecorator(
      storyFn,
      context({ parameters: { __isArgsStory: false, docs: { source: { type: 'dynamic' } } } })
    );

    expect(emitTransformCode).toHaveBeenCalledTimes(1);
  });
});

describe('the renderer default does not suppress emission', () => {
  // `parameters.renderer` is 'astro' for every story and is never unset, so a
  // naive "skip when renderer is set" check would emit nothing at all.
  test('the default astro renderer still emits', () => {
    sourceDecorator(storyFn, context({ parameters: { renderer: 'astro' } }));

    expect(emitTransformCode).toHaveBeenCalledTimes(1);
  });
});

// Storybook 11 parses stories files with OXC and sets `docs.source.originalSource`
// to the story as authored, where 10 reprinted it with Babel. The parameters
// here come from the installed Storybook's csf-tools, so the storybook-11 CI job
// checks them against 11 (issue #207).
const { versions } = await import('storybook/internal/common');
const isStorybook11 = Number.parseInt(versions.storybook, 10) >= 11;

describe('the parameters Storybook reads from the stories file (issue #207)', () => {
  const storiesFile = [
    "import Card from './Card.astro';",
    'export default { component: Card };',
    'export const Featured = {',
    '  args: { title: "Hello",   featured: true },',
    '};',
    "export const Custom = { render: () => 'custom' };"
  ].join('\n');

  async function storyParameters(name: string) {
    const csfTools = await import('storybook/internal/csf-tools');
    const csf = csfTools.loadCsf(storiesFile, { makeTitle: () => 'Astro/Card' }).parse();
    // What addon-docs stores as `originalSource`. Storybook 11 slices it from
    // the file's text; 10 reprints the node and takes no second argument.
    const extractSource = csfTools.extractSource as (node: unknown, code: string) => string;

    return {
      __isArgsStory: csf._stories[name].parameters?.__isArgsStory,
      docs: { source: { originalSource: extractSource(csf.getStoryExport(name), storiesFile) } }
    };
  }

  test('an args story still shows the Astro snippet, not the story as authored', async () => {
    const parameters = await storyParameters('Featured');

    sourceDecorator(
      storyFn,
      context({ args: { title: 'Hello', featured: true }, parameters })
    );

    expect(emitTransformCode).toHaveBeenCalledTimes(1);
    expect(emitTransformCode.mock.calls[0][0]).toBe(
      ['---', "import Card from './Card.astro';", '---', '<Card featured title="Hello" />'].join('\n')
    );
  });

  test('a custom-render story emits nothing, so Show code falls back to originalSource', async () => {
    const parameters = await storyParameters('Custom');

    sourceDecorator(storyFn, context({ parameters }));

    expect(parameters.__isArgsStory).toBe(false);
    expect(parameters.docs.source.originalSource).toContain("render: () => 'custom'");
    expect(emitTransformCode).not.toHaveBeenCalled();
  });

  test.runIf(isStorybook11)('on Storybook 11, originalSource is the story exactly as written', async () => {
    const { docs } = await storyParameters('Featured');

    expect(docs.source.originalSource).toBe('{\n  args: { title: "Hello",   featured: true },\n}');
  });
});
