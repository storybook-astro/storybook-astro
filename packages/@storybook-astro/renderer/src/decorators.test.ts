import { describe, expect, test } from 'vitest';
import type { StoryContext } from 'storybook/internal/types';
import type { LegacyStoryFn } from 'storybook/internal/csf';
import { applyDecorators, type AstroDecorator } from './decorators.ts';
import type { AstroComponentFactory, AstroRenderer } from './types.ts';

function fakeAstroComponent(moduleId: string): AstroComponentFactory {
  const factory = (() => undefined) as unknown as AstroComponentFactory;

  factory.isAstroComponentFactory = true;
  factory.moduleId = moduleId;

  return factory;
}

/** A minimal story context — only `parameters.renderer` matters to composition. */
function storyContext(renderer = 'astro'): StoryContext<AstroRenderer> {
  return { parameters: { renderer } } as StoryContext<AstroRenderer>;
}

const baseComponent = fakeAstroComponent('/src/Base.astro');
const baseStoryFn: LegacyStoryFn<AstroRenderer> = () => baseComponent;

describe('applyDecorators — Astro composition', () => {
  test('zero decorators returns the base story result untouched', () => {
    const composed = applyDecorators(baseStoryFn, []);

    expect(composed(storyContext())).toBe(baseComponent);
  });

  test('a decorator that just returns Story() is a no-op', () => {
    const decorators = [(Story: () => unknown) => Story()] as unknown as AstroDecorator[];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed(storyContext())).toBe(baseComponent);
  });

  test('guarded global decorators (Step 1 pattern) are identity for Astro stories', () => {
    // Mirrors integration/*/.storybook/preview.js: a decorator meant for one
    // framework must be a strict pass-through for every other story, Astro
    // included, since it never sets `parameters.renderer` to that framework.
    const wrapReactStory = (Story: () => unknown, ctx: StoryContext<AstroRenderer>) =>
      ctx.parameters.renderer !== 'react' ? Story() : { wrapped: Story() };
    const wrapVueStory = (Story: () => unknown, ctx: StoryContext<AstroRenderer>) =>
      ctx.parameters.renderer !== 'vue' ? Story() : { wrapped: Story() };

    const composed = applyDecorators(baseStoryFn, [wrapReactStory, wrapVueStory] as unknown as AstroDecorator[]);

    expect(composed(storyContext('astro'))).toBe(baseComponent);
  });

  test('Story() resolves inside a nested descriptor slot', () => {
    const Layout = fakeAstroComponent('/src/Layout.astro');
    const Card = fakeAstroComponent('/src/Card.astro');
    const decorators = [
      (Story: () => unknown) => ({
        component: Layout,
        slots: { default: { component: Card, slots: { default: Story() } } }
      })
    ] as unknown as AstroDecorator[];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed(storyContext())).toEqual({
      component: Layout,
      props: undefined,
      slots: { default: { component: Card, slots: { default: baseComponent } } }
    });
  });

  test('a descriptor decorator wraps the story in its default slot, reading context along the way', () => {
    const Wrapper = fakeAstroComponent('/src/Wrapper.astro');
    const decorators = [
      (_Story: () => unknown, ctx: StoryContext<AstroRenderer>) => ({
        component: Wrapper,
        props: { theme: ctx.parameters.theme }
      })
    ] as unknown as AstroDecorator[];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed({ parameters: { renderer: 'astro', theme: 'dark' } } as StoryContext<AstroRenderer>)).toEqual({
      component: Wrapper,
      props: { theme: 'dark' },
      slots: { default: baseComponent }
    });
  });

  test('auto default-slot applies even when the decorator never calls Story()', () => {
    const Wrapper = fakeAstroComponent('/src/Wrapper.astro');
    const decorators = [
      () => ({ component: Wrapper, props: { theme: 'dark' } })
    ] as unknown as AstroDecorator[];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed(storyContext())).toEqual({
      component: Wrapper,
      props: { theme: 'dark' },
      slots: { default: baseComponent }
    });
  });

  test('named slots: an explicit default slot and an extra named slot both resolve', () => {
    const Layout = fakeAstroComponent('/src/Layout.astro');
    const decorators = [
      (Story: () => unknown) => ({
        component: Layout,
        slots: { default: Story(), sidebar: '<nav>Sidebar</nav>' }
      })
    ] as unknown as AstroDecorator[];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed(storyContext())).toEqual({
      component: Layout,
      props: undefined,
      slots: { default: baseComponent, sidebar: '<nav>Sidebar</nav>' }
    });
  });

  test('a bare Astro component in the decorators array wraps the story (sugar)', () => {
    const Wrapper = fakeAstroComponent('/src/Wrapper.astro');
    const composed = applyDecorators(baseStoryFn, [Wrapper]);

    expect(composed(storyContext())).toEqual({
      component: Wrapper,
      props: undefined,
      slots: { default: baseComponent }
    });
  });

  // Regression test (docs/specs/decorators.md#renderer-composition): Storybook's
  // `prepareStory` never hands `applyDecorators` the raw `decorators` array —
  // `applyHooks` (storybook/internal/preview-api) first replaces every entry,
  // bare components included, with a `hookify()`-wrapped function so it can
  // track Storybook preview hooks per decorator. That wrapper stashes the
  // original value at `.originalFn` but otherwise looks like a generic
  // function, with no `isAstroComponentFactory` marker of its own. Composing
  // a bare-component decorator through the real Storybook pipeline (any real
  // Storybook, portable-stories, or CSF4 usage) hits this every time — only
  // calling `applyDecorators` directly, like the test above, skips it. Fixed
  // by unwrapping `.originalFn` before the `isAstroComponentFactory` check.
  test('a bare Astro component wrapped by Storybook\'s own hookify() is still recognized as sugar', () => {
    const Wrapper = fakeAstroComponent('/src/Wrapper.astro');
    const hookifiedWrapper = Object.assign((..._args: unknown[]) => undefined, { originalFn: Wrapper });

    const composed = applyDecorators(baseStoryFn, [hookifiedWrapper as unknown as AstroDecorator]);

    expect(composed(storyContext())).toEqual({
      component: Wrapper,
      props: undefined,
      slots: { default: baseComponent }
    });
  });

  test('two decorators compose inside-out: the first wraps the story, the second wraps that', () => {
    const Inner = fakeAstroComponent('/src/Inner.astro');
    const Outer = fakeAstroComponent('/src/Outer.astro');
    const decorators = [Inner, Outer];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed(storyContext())).toEqual({
      component: Outer,
      props: undefined,
      slots: {
        default: {
          component: Inner,
          props: undefined,
          slots: { default: baseComponent }
        }
      }
    });
  });

  test('a string decorator with one Story() interpolation splits into [before, inner, after]', () => {
    const decorators = [
      (Story: () => unknown) => `<div class="dark-background">${Story()}</div>`
    ] as unknown as AstroDecorator[];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed(storyContext())).toEqual([
      '<div class="dark-background">',
      baseComponent,
      '</div>'
    ]);
  });

  test('a string decorator that interpolates Story() twice splices the inner tree at each occurrence', () => {
    const decorators = [
      (Story: () => unknown) => {
        const story = Story();

        return `<div>${story}${story}</div>`;
      }
    ] as unknown as AstroDecorator[];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed(storyContext())).toEqual(['<div>', baseComponent, baseComponent, '</div>']);
  });

  test('a string decorator with no Story() token replaces the story outright', () => {
    const decorators = [() => '<p>Replaced entirely</p>'] as unknown as AstroDecorator[];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed(storyContext())).toBe('<p>Replaced entirely</p>');
  });

  test('mixed chain: a component descriptor nested inside a string wrapper', () => {
    const Wrapper = fakeAstroComponent('/src/Wrapper.astro');
    const decorators = [
      () => ({ component: Wrapper }),
      (Story: () => unknown) => `<div class="theme">${Story()}</div>`
    ] as unknown as AstroDecorator[];

    const composed = applyDecorators(baseStoryFn, decorators);

    expect(composed(storyContext())).toEqual([
      '<div class="theme">',
      { component: Wrapper, props: undefined, slots: { default: baseComponent } },
      '</div>'
    ]);
  });
});

describe('applyDecorators — framework story passthrough', () => {
  test('parameters.renderer set to a framework delegates to defaultDecorateStory', () => {
    const frameworkStoryFn: LegacyStoryFn<AstroRenderer> = () =>
      'react-element-marker' as unknown as AstroRenderer['storyResult'];
    const wrapInDiv = (Story: () => unknown) => `<wrapped>${Story()}</wrapped>`;

    const composed = applyDecorators(frameworkStoryFn, [wrapInDiv] as unknown as AstroDecorator[]);

    // Unlike Astro composition, `Story()` here returns the *real* inner
    // result eagerly (Storybook's own `defaultDecorateStory`), not a handle —
    // so plain string concatenation works without any token-splitting.
    expect(composed(storyContext('react'))).toBe('<wrapped>react-element-marker</wrapped>');
  });

  test('zero decorators is still identity for framework stories', () => {
    const frameworkStoryFn: LegacyStoryFn<AstroRenderer> = () =>
      'react-element-marker' as unknown as AstroRenderer['storyResult'];

    const composed = applyDecorators(frameworkStoryFn, []);

    expect(composed(storyContext('react'))).toBe('react-element-marker');
  });
});
