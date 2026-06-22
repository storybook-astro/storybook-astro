import { describe, expect, test } from 'vitest';
import { reviveDateStrings } from './revive-dates.ts';

describe('reviveDateStrings', () => {
  test('converts an ISO 8601 date string to a Date object', () => {
    const args = { pubDate: '2025-04-12T00:00:00.000Z' };
    const result = reviveDateStrings(args);

    expect(result.pubDate).toBeInstanceOf(Date);
    expect((result.pubDate as Date).toISOString()).toBe('2025-04-12T00:00:00.000Z');
  });

  test('converts dates nested inside objects', () => {
    const args = {
      post: {
        data: {
          pubDate: '2025-04-12T00:00:00.000Z'
        }
      }
    };
    const result = reviveDateStrings(args);

    expect((result.post as Record<string, unknown>)).toMatchObject({
      data: {
        pubDate: expect.any(Date)
      }
    });
  });

  test('converts dates inside arrays', () => {
    const args = {
      posts: [
        { pubDate: '2025-04-12T00:00:00.000Z' },
        { pubDate: '2025-03-08T00:00:00.000Z' }
      ]
    };
    const result = reviveDateStrings(args);
    const posts = result.posts as Array<{ pubDate: Date }>;

    expect(posts[0].pubDate).toBeInstanceOf(Date);
    expect(posts[1].pubDate).toBeInstanceOf(Date);
    expect(posts[0].pubDate.toISOString()).toBe('2025-04-12T00:00:00.000Z');
    expect(posts[1].pubDate.toISOString()).toBe('2025-03-08T00:00:00.000Z');
  });

  test('leaves non-date strings untouched', () => {
    const args = {
      title: 'Hello World',
      description: 'A post about dates',
      empty: ''
    };
    const result = reviveDateStrings(args);

    expect(result.title).toBe('Hello World');
    expect(result.description).toBe('A post about dates');
    expect(result.empty).toBe('');
  });

  test('leaves date-only strings untouched (no time component)', () => {
    const args = { date: '2025-04-12' };
    const result = reviveDateStrings(args);

    expect(result.date).toBe('2025-04-12');
  });

  test('leaves partial ISO strings untouched', () => {
    const args = {
      noMillis: '2025-04-12T00:00:00Z',
      withOffset: '2025-04-12T00:00:00.000+00:00',
      dateOnly: '2025-04-12'
    };
    const result = reviveDateStrings(args);

    expect(result.noMillis).toBe('2025-04-12T00:00:00Z');
    expect(result.withOffset).toBe('2025-04-12T00:00:00.000+00:00');
    expect(result.dateOnly).toBe('2025-04-12');
  });

  test('preserves non-string values', () => {
    const args = {
      count: 42,
      active: true,
      missing: null,
      tags: ['a', 'b']
    };
    const result = reviveDateStrings(args);

    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.missing).toBe(null);
    expect(result.tags).toEqual(['a', 'b']);
  });

  test('handles an empty args object', () => {
    expect(reviveDateStrings({})).toEqual({});
  });

  test('round-trips a Date through JSON serialization', () => {
    const original = new Date('2025-06-04T14:30:00.000Z');
    const serialized = JSON.parse(JSON.stringify({ date: original })) as Record<string, unknown>;
    const result = reviveDateStrings(serialized);

    expect(result.date).toBeInstanceOf(Date);
    expect((result.date as Date).getTime()).toBe(original.getTime());
  });
});
