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
