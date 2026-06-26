import { test, expect } from 'vitest';
import { processImageMetadata } from './astroRenderHandler.ts';

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
