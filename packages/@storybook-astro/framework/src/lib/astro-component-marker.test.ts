import { test, expect, vi } from 'vitest';
import {
  ASTRO_COMPONENT_MARKER,
  isAstroComponentMarker,
  serializeAstroComponentMarkers
} from '@storybook-astro/renderer/types';

const factory = (moduleId: string | undefined) =>
  Object.assign(() => undefined, { isAstroComponentFactory: true as const, moduleId });

test('isAstroComponentMarker requires both the flag and a string moduleId', () => {
  expect(isAstroComponentMarker({ [ASTRO_COMPONENT_MARKER]: true, moduleId: '/A.astro' })).toBe(true);
  // A plain object that happens to share one key is not a marker.
  expect(isAstroComponentMarker({ [ASTRO_COMPONENT_MARKER]: true })).toBe(false);
  expect(isAstroComponentMarker({ moduleId: '/A.astro' })).toBe(false);
  expect(isAstroComponentMarker({ [ASTRO_COMPONENT_MARKER]: 'yes', moduleId: '/A.astro' })).toBe(false);
});

test('serializeAstroComponentMarkers replaces factories with markers, including when nested', () => {
  const result = serializeAstroComponentMarkers({
    Icon: factory('/Icon.astro'),
    nested: { Inner: factory('/Inner.astro') },
    list: [factory('/A.astro'), 'keep']
  }) as Record<string, unknown>;

  expect(result.Icon).toEqual({ [ASTRO_COMPONENT_MARKER]: true, moduleId: '/Icon.astro' });
  expect((result.nested as Record<string, unknown>).Inner).toEqual({
    [ASTRO_COMPONENT_MARKER]: true,
    moduleId: '/Inner.astro'
  });
  expect((result.list as unknown[])[0]).toEqual({ [ASTRO_COMPONENT_MARKER]: true, moduleId: '/A.astro' });
  expect((result.list as unknown[])[1]).toBe('keep');
});

test('serializeAstroComponentMarkers drops a factory with no moduleId and reports it', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const result = serializeAstroComponentMarkers({ Icon: factory(undefined) }) as Record<string, unknown>;

  expect(result.Icon).toBeUndefined();
  expect(error).toHaveBeenCalled();

  error.mockRestore();
});

test('serializeAstroComponentMarkers leaves non-component values untouched', () => {
  expect(serializeAstroComponentMarkers({ a: 1, b: 'x', c: null })).toEqual({ a: 1, b: 'x', c: null });
});
