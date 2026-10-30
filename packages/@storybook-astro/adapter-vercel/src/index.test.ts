import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { vercel } from './index.ts';

test('builds the render app with @astrojs/vercel', async () => {
  const appDir = await mkdtemp(join(tmpdir(), 'storybook-astro-app-'));
  const adapter = vercel();

  expect((await adapter.createAstroAdapter(appDir)).name).toBe('@astrojs/vercel');
  expect(adapter.nextSteps).toContain('vercel deploy --prebuilt');
});
