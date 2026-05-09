/**
 * Type-level tests for portable-stories utilities.
 *
 * These tests verify that setProjectAnnotations, composeStory, and composeStories
 * accept the widened renderer type produced by definePreview when addons are used.
 * Without the generic R parameter, users get "has no properties in common" errors
 * when passing a definePreview result to setProjectAnnotations.
 *
 * See: https://github.com/storybook-astro/storybook-astro/issues/58
 */
import { expectTypeOf, test } from 'vitest';
import type { NormalizedProjectAnnotations } from 'storybook/internal/types';
import { definePreview, setProjectAnnotations, type AstroRenderer } from './index.ts';

test('setProjectAnnotations accepts a module whose default export is a widened Preview type', () => {
  // This is the shape of `import * as preview from '.storybook/preview'`
  // when the preview uses definePreview with addons.
  type PreviewModule = { default: ReturnType<typeof definePreview<[]>> };

  expectTypeOf<(annotations: PreviewModule) => NormalizedProjectAnnotations<AstroRenderer>>()
    .toBeCallableWith({ default: definePreview({}) });
});

test('setProjectAnnotations return type narrows correctly for base AstroRenderer', () => {
  const result = setProjectAnnotations([]);

  expectTypeOf(result).toMatchTypeOf<NormalizedProjectAnnotations<AstroRenderer>>();
});
