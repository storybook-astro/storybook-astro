import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { netlify } from './index.ts';

test('builds the render app with @astrojs/netlify', async () => {
  const appDir = await mkdtemp(join(tmpdir(), 'storybook-astro-app-'));
  const adapter = netlify();

  expect((await adapter.createAstroAdapter({ projectDir: process.cwd(), appDir })).name).toBe('@astrojs/netlify');
});
