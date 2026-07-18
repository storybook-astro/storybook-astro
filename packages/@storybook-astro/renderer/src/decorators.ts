// Composes Storybook's `decorators` project/component/story annotations into a
// story function, via the `applyDecorators` hook (`DecoratorApplicator` in
// `storybook/internal/csf`) — the same mechanism `@storybook/vue3` and
// `@storybook/svelte` use to normalize decorator return values for their own
// render pipelines. See docs/DECORATOR_SUPPORT.md for the full design.
//
// Kept free of virtual-module imports (like preview-defaults.ts) so Node test
// processes and the framework package can import it directly without pulling
// in render.tsx's browser-only chain — see entry-preview.ts and
// framework/src/index.ts for how it's wired in.
import { defaultDecorateStory } from 'storybook/internal/preview-api';
import type { DecoratorFunction, LegacyStoryFn, PartialStoryFn } from 'storybook/internal/csf';
import type { StoryContext } from 'storybook/internal/types';
import {
  isAstroComponentFactory,
  isAstroComponentSlot,
  type AstroComponentFactory,
  type AstroComponentSlot,
  type AstroRenderer,
  type SlotValue
} from './types.ts';

/**
 * One entry of a `decorators` array for an Astro story. Usually a function
 * `(Story, context) => ...` like any Storybook decorator, but a bare Astro
 * component is accepted too — sugar for `(Story) => ({ component })`, so
 * `decorators: [Wrapper]` wraps the story without writing a function at all
 * (Decorator Contract, form 3).
 */
export type AstroDecorator = DecoratorFunction<AstroRenderer> | AstroComponentFactory;

/**
 * What `Story()` returns while composing Astro decorators. It never carries
 * the actual rendered output — Astro stories render server-side in a single
 * pass (Decision 2), so there's nothing to render yet when the decorator
 * function runs. `toString()` emits a token unique to this handle, so a
 * decorator can drop it straight into a template literal
 * (`` `<div>${Story()}</div>` ``); `resolveHandle` below swaps every
 * occurrence of that token back out for the real inner tree once the
 * decorator returns.
 */
type StoryHandle = { toString(): string };

let handleCount = 0;

function createStoryHandle(): StoryHandle {
  handleCount += 1;

  // Vanishingly unlikely to appear in hand-authored HTML, and unique per
  // decorator invocation within a render (the counter never resets).
  const token = `@@storybook-astro-decorator-story:${handleCount}@@`;

  return { toString: () => token };
}

/**
 * Composes `decorators` around `storyFn`. This is the renderer's
 * `applyDecorators` project annotation.
 *
 * Which pipeline a story needs is only known once Storybook has prepared its
 * context, so both compositions are built once here and the returned function
 * picks one per call:
 *
 * - Framework stories (`parameters.renderer` set to a delegated framework —
 *   `'react'`, `'vue'`, etc.) use Storybook's own `defaultDecorateStory`, so
 *   decorators behave exactly as they would in a plain Storybook project: the
 *   framework's own `renderToCanvas` calls `storyFn()` and already knows what
 *   to do with whatever it returns (Decision 3).
 * - Astro stories (everything else) compose into the `SlotValue` tree the rest
 *   of the render pipeline already understands (`./types.ts`), so a wrapper
 *   decorator becomes an `AstroComponentSlot` around the inner story instead
 *   of Storybook's generic, React-shaped composition (Decision 2).
 *
 * `parameters.renderer` defaults to `'astro'` for every story — it's never
 * `undefined` (see `parameters` in entry-preview.ts and `definePreview` in
 * framework/src/index.ts) — so "framework story" means "set to something
 * other than `'astro'`", not merely "set".
 */
export function applyDecorators(
  storyFn: LegacyStoryFn<AstroRenderer>,
  decorators: AstroDecorator[]
): LegacyStoryFn<AstroRenderer> {
  const decorateFrameworkStory = defaultDecorateStory(
    storyFn,
    decorators as DecoratorFunction<AstroRenderer>[]
  );

  return (context: StoryContext<AstroRenderer>) => {
    const renderer = context.parameters?.renderer as string | undefined;

    if (renderer && renderer !== 'astro') {
      return decorateFrameworkStory(context);
    }

    return composeAstroTree(storyFn(context), decorators, context);
  };
}

/**
 * Builds the decorated `SlotValue` tree for an Astro story. Decorators run
 * inside-out to match `defaultDecorateStory`'s order — confirmed against its
 * implementation in `storybook/internal/preview-api`: it reduces over the
 * decorators array wrapping the previous story with each entry in turn, so
 * `decorators[0]` wraps the real story directly (innermost) and each later
 * entry wraps everything decided so far, ending with the *last* array entry
 * as the outermost wrapper.
 */
function composeAstroTree(
  baseResult: AstroRenderer['storyResult'],
  decorators: AstroDecorator[],
  context: StoryContext<AstroRenderer>
): SlotValue {
  let tree: SlotValue = baseResult as SlotValue;

  for (const decorator of decorators) {
    const handle = createStoryHandle();
    const Story = (() => handle) as unknown as PartialStoryFn<AstroRenderer>;

    // Sugar: a bare Astro component in the decorators array wraps the story
    // in its default slot without needing a decorator function at all.
    const result = isAstroComponentFactory(decorator)
      ? { component: decorator as AstroComponentFactory }
      : (decorator as DecoratorFunction<AstroRenderer>)(Story, context);

    tree = normalizeDecoratorResult(result, handle, tree);
  }

  return tree;
}

/** Turns one decorator's return value into the next layer of the tree. */
function normalizeDecoratorResult(result: unknown, handle: StoryHandle, innerTree: SlotValue): SlotValue {
  if (result === null || result === undefined) {
    throw new Error(
      '[storybook-astro] A decorator returned nothing. Return `Story()`, a string built from it, ' +
        'or a component descriptor — see docs/DECORATOR_SUPPORT.md.'
    );
  }

  if (isAstroComponentSlot(result)) {
    const slots: Record<string, SlotValue> = { ...(result.slots as Record<string, SlotValue> | undefined) };

    // If the decorator never placed the story explicitly, it goes in the
    // default slot — whether or not the decorator ever called `Story()`.
    if (!('default' in slots)) {
      slots.default = innerTree;
    }

    for (const key of Object.keys(slots)) {
      slots[key] = resolveHandle(slots[key], handle, innerTree);
    }

    return {
      component: result.component as AstroComponentFactory,
      props: result.props,
      slots
    } satisfies AstroComponentSlot;
  }

  return resolveHandle(result as SlotValue, handle, innerTree);
}

/**
 * Replaces every occurrence of `handle` inside `value` with `innerTree` — the
 * one place composition actually resolves the placeholder. A value that never
 * references the handle (a string with no token, a component with no slots, a
 * different component entirely) passes through untouched: the decorator
 * replaced the story rather than wrapping it.
 */
function resolveHandle(value: SlotValue, handle: StoryHandle, innerTree: SlotValue): SlotValue {
  if ((value as unknown) === handle) {
    return innerTree;
  }

  if (typeof value === 'string') {
    const token = handle.toString();

    if (!value.includes(token)) {
      return value;
    }

    const segments = value.split(token);
    const pieces: SlotValue[] = [];

    segments.forEach((segment, index) => {
      if (segment) {
        pieces.push(segment);
      }

      // A split leaves one fewer gap than segments — one inner tree per gap,
      // so a decorator that interpolates `Story()` more than once (or reuses
      // the same handle in a loop) splices the inner tree at every occurrence.
      if (index < segments.length - 1) {
        pieces.push(innerTree);
      }
    });

    return flattenSlotValues(pieces);
  }

  if (Array.isArray(value)) {
    return flattenSlotValues(value.map((entry) => resolveHandle(entry, handle, innerTree)));
  }

  // A nested descriptor can slot the story too, e.g. a decorator returning
  // `{ component: Layout, slots: { main: { component: Card, slots: { default: Story() } } } }`.
  if (isAstroComponentSlot(value)) {
    const slots = value.slots as Record<string, SlotValue> | undefined;

    if (slots) {
      const resolved: Record<string, SlotValue> = {};

      for (const [name, slotValue] of Object.entries(slots)) {
        resolved[name] = resolveHandle(slotValue, handle, innerTree);
      }

      return { ...value, slots: resolved } as AstroComponentSlot;
    }
  }

  return value;
}

/** Flattens one level of nesting — splicing in an inner tree that's itself an array shouldn't nest it further. */
function flattenSlotValues(values: SlotValue[]): SlotValue {
  const flat = values.flatMap((value) => (Array.isArray(value) ? value : [value]));

  return flat.length === 1 ? flat[0] : flat;
}
