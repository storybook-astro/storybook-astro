import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { node } from './index.ts';

test('builds the render app with @astrojs/node as a standalone server', async () => {
  const appDir = await mkdtemp(join(tmpdir(), 'storybook-astro-app-'));
  const adapter = node();

  expect((await adapter.createAstroAdapter({ projectDir: process.cwd(), appDir })).name).toBe('@astrojs/node');
  expect(adapter.nextSteps).toContain('node storybook-server/server/entry.mjs');
});
