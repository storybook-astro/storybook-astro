import { test, expect, vi } from 'vitest';
import {
  ASTRO_COMPONENT_MARKER,
  isAstroComponentMarker,
  serializeAstroComponentMarkers
} from '@storybook-astro/renderer/types';
import { reviveDateStrings } from './revive-dates.ts';

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

test('serializeAstroComponentMarkers preserves Date instances instead of clobbering them to {}', () => {
  const date = new Date('2025-04-12T00:00:00.000Z');
  const result = serializeAstroComponentMarkers({ pubDate: date }) as Record<string, unknown>;

  expect(result.pubDate).toBeInstanceOf(Date);
  expect(result.pubDate).toBe(date);
});

test('a Date nested in args survives serialize + JSON transport + revive (PostFeed regression)', () => {
  // Mirrors the PostFeed story: posts[].data.pubDate. The client serializer must
  // not flatten the Date so JSON.stringify can emit an ISO string the server revives.
  const args = {
    posts: [{ id: 'a', data: { title: 'A', pubDate: new Date('2025-04-12T00:00:00.000Z') } }]
  };

  const transported = JSON.parse(JSON.stringify(serializeAstroComponentMarkers(args)));
  const revived = reviveDateStrings(transported as Record<string, unknown>);

  const pubDate = (revived.posts as Array<{ data: { pubDate: unknown } }>)[0].data.pubDate;

  expect(pubDate).toBeInstanceOf(Date);
  expect((pubDate as Date).toISOString()).toBe('2025-04-12T00:00:00.000Z');
});
